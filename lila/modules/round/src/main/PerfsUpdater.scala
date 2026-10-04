package lila.round

import chess.{ ByColor, IntRating }
import chess.rating.IntRatingDiff
import chess.rating.glicko.Glicko

import lila.core.perf.{ UserPerfs, UserWithPerfs }
import lila.rating.PerfExt.addOrResetCapped
import lila.rating.{ GoRating, PerfType, RatingRegulator }
import lila.user.{ RankingApi, UserApi }

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
  /* The new perfs and rating changes a finished rated game gives its players, or none if it
   * moves no ratings. No I/O but logging: the class saves them (LiGo: split out in unit 5.3 so
   * tests can rate a whole game). */
  private[round] def newPerfs(
      game: Game,
      prevPerfs: ByColor[UserPerfs],
      isBot: ByColor[Boolean]
  ): Option[(ByColor[IntRatingDiff], ByColor[UserPerfs], PerfKey)] = for
    outcome <- game.outcome
    perfKey = game.perfKey
    prevPlayers = prevPerfs.map(perfs => GoRatedGame.player(perfs(perfKey)))
    computedGlickos <- computeGoGlicko(game.id, game.go.setup, prevPerfs.map(_(perfKey)), outcome)
  yield
    // no factor for the `go` perf (ADR 0021 §1): only the halving against a bot applies
    val newGlickos = RatingRegulator(perfKey, prevPlayers.map(_.glicko), computedGlickos, isBot)
    val newPerfs = prevPerfs.zip(newGlickos, (perfs, gl) => addToPerfs(game, perfs, perfKey, gl))
    val ratingDiffs =
      def ratingOf(perfs: UserPerfs) = perfs(perfKey).glicko.intRating.value
      prevPerfs.zip(newPerfs, (prev, next) => IntRatingDiff(ratingOf(next) - ratingOf(prev)))
    (ratingDiffs, newPerfs, perfKey)

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
    perfs
      .focusKey(perfKey)
      .modify:
        _.addOrResetCapped(lila.mon.round.error.glicko, s"game ${game.id}", GoRating.cap)(
          player,
          game.movedAt
        )
