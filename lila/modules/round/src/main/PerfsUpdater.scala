package lila.round

import chess.{ ByColor, IntRating }
import chess.rating.{ IntRatingDiff, RatingProvisional }
import chess.rating.glicko.{ Glicko, Player }
import chess.variant.Variant

import lila.core.perf.{ UserPerfs, UserWithPerfs }
import lila.rating.GlickoExt.cap
import lila.rating.PerfExt.addOrResetCapped
import lila.rating.{ GoRating, PerfType, RatingRegulator }
import lila.user.{ RankingApi, UserApi }
import lila.rating.PerfExt.toGlickoPlayer

final class PerfsUpdater(
    gameRepo: lila.game.GameRepo,
    userApi: UserApi,
    rankingApi: RankingApi,
    farming: FarmBoostDetection
)(using Executor):

  def save(game: Game, users: ByColor[UserWithPerfs]): Fu[Option[ByColor[IntRatingDiff]]] =
    (game.rated.yes && game.finished && (game.playedPlies >= 2 || game.isTournament)).so:
      for
        isBotFarming <- farming.botFarming(game)
        isBoosting <- farming.newAccountBoosting(game, users)
        result <- (!isBotFarming && !isBoosting).so:
          calculateRatingAndPerfs(game, users).so:
            saveRatings(game.id, users)
      yield result

  private def calculateRatingAndPerfs(game: Game, users: ByColor[UserWithPerfs]): Option[
    (ByColor[IntRatingDiff], ByColor[UserWithPerfs], PerfKey)
  ] = for
    _ <- (!users.exists(_.user.lame)).option(())
    (ratingDiffs, newPerfs, perfKey) <- PerfsUpdater.newPerfs(game, users.map(_.perfs), users.map(_.isBot))
  yield
    val newUsers = users.zip(newPerfs, (user, perfs) => user.copy(perfs = perfs))
    lila.common.Bus.pub(lila.core.game.PerfsUpdate(game, newUsers))
    (ratingDiffs, newUsers, perfKey)

  private def saveRatings(gameId: GameId, prevUsers: ByColor[UserWithPerfs])(
      ratingDiffs: ByColor[IntRatingDiff],
      newUsers: ByColor[UserWithPerfs],
      perfKey: PerfKey
  ): Fu[Option[ByColor[IntRatingDiff]]] =
    gameRepo
      .setRatingDiffs(gameId, ratingDiffs)
      .zip(userApi.updatePerfs(prevUsers.map(_.perfs).zip(newUsers.map(_.perfs)), perfKey))
      .zip(rankingApi.save(newUsers, perfKey))
      .inject(ratingDiffs.some)

object PerfsUpdater:
  def withCalculator(variant: Variant) =
    if variant.standard then lila.rating.Glicko.calculatorWithStandardAdvantage
    else if variant.crazyhouse then lila.rating.Glicko.calculatorWithCrazyhouseAdvantage
    else lila.rating.Glicko.calculator

  /* The new perfs and rating changes a finished rated game gives its players, or none if it
   * moves no ratings. No I/O but logging: the class saves them (LiGo: split out in unit 5.3 so
   * tests can rate a whole game). */
  private[round] def newPerfs(
      game: Game,
      prevPerfs: ByColor[UserPerfs],
      isBot: ByColor[Boolean]
  ): Option[(ByColor[IntRatingDiff], ByColor[UserPerfs], PerfKey)] = for
    outcome <- game.outcome
    perfKey <-
      if game.variant.fromPosition
      then game.isTournament.option(PerfKey(game.ratingVariant, game.speed))
      else game.perfKey.some
    prevPlayers = prevPerfs.map: perfs =>
      if game.isGo then GoRatedGame.player(perfs(perfKey)) else perfs(perfKey).toGlickoPlayer
    computedGlickos <- game.go.fold(computeGlicko(game, prevPlayers, outcome).map(_.map(_.glicko))): go =>
      computeGoGlicko(game.id, go.setup, prevPerfs.map(_(perfKey)), outcome)
  yield
    // no factor for the `go` perf (ADR 0021 §1): only the halving against a bot applies
    val newGlickos = RatingRegulator(perfKey, prevPlayers.map(_.glicko), computedGlickos, isBot)
    val newPerfs = prevPerfs.zip(newGlickos, (perfs, gl) => addToPerfs(game, perfs, perfKey, gl))
    val ratingDiffs =
      def ratingOf(perfs: UserPerfs) = perfs(perfKey).glicko.intRating.value
      prevPerfs.zip(newPerfs, (prev, next) => IntRatingDiff(ratingOf(next) - ratingOf(prev)))
    (ratingDiffs, newPerfs, perfKey)

  private def computeGlicko(game: Game, prevPlayers: ByColor[Player], outcome: chess.Outcome) =
    val gameId = game.id
    // uses crazyhouse or standard ColorAdvantage, except for From Position games
    withCalculator(game.variant)
      .computeGame(chess.rating.glicko.Game(prevPlayers, outcome), skipDeviationIncrease = true)
      .onError: err =>
        scala.util.Success(logger.warn(s"Error computing Glicko2 for game $gameId", err))
      .toOption

  // LiGo: Go's calculator, handicap and caps (ADR 0013, ADR 0021 §4, unit 5.3)
  private def computeGoGlicko(
      gameId: GameId,
      setup: ligo.gorules.Setup,
      prevPerfs: ByColor[Perf],
      outcome: chess.Outcome
  ): Option[ByColor[Glicko]] =
    GoRatedGame
      .glickos(setup, prevPerfs, outcome)
      .left
      .map(why => logger.warn(s"Rated Go game $gameId not rated: $why"))
      .toOption

  private def addToPerfs(game: Game, perfs: UserPerfs, perfKey: PerfKey, player: Glicko) =
    val cap: Glicko => Glicko = if game.isGo then GoRating.cap else _.cap
    val newPerfs = perfs
      .focusKey(perfKey)
      .modify:
        _.addOrResetCapped(lila.mon.round.error.glicko, s"game ${game.id}", cap)(player, game.movedAt)
    // a Go game's variant is chess's standard until unit 3.17, but it leaves the chess perfs alone
    if game.ratingVariant.standard && !game.isGo
    then updateStandard(newPerfs)
    else newPerfs

  private def updateStandard(p: UserPerfs) =
    p.copy(
      standard =
        val subs = List(p.bullet, p.blitz, p.rapid, p.classical, p.correspondence).filter(_.provisional.no)
        subs.maxByOption(_.latest.fold(0L)(_.toMillis)).flatMap(_.latest).fold(p.standard) { date =>
          val nb = subs.map(_.nb).sum
          val glicko = Glicko(
            rating = subs.map(s => s.glicko.rating * (s.nb / nb.toDouble)).sum,
            deviation = subs.map(s => s.glicko.deviation * (s.nb / nb.toDouble)).sum,
            volatility = subs.map(s => s.glicko.volatility * (s.nb / nb.toDouble)).sum
          )
          Perf(
            glicko = glicko,
            nb = nb,
            recent = Nil,
            latest = date.some
          )
        }
    )
