package lila.puzzle

import chess.{ Rated, ByColor }
import chess.rating.glicko.{ Glicko, GlickoCalculator }
import scalalib.actor.AsyncActorSequencers

import lila.common.Bus
import lila.core.perf.Perf
import lila.db.dsl.{ *, given }
import lila.rating.GlickoExt.{ cap, sanityCheck }
import lila.rating.PerfExt.*
import lila.rating.PerfType

final private[puzzle] class PuzzleFinisher(
    api: PuzzleApi,
    userApi: lila.core.user.UserApi,
    historyApi: lila.core.history.HistoryApi,
    colls: PuzzleColls
)(using Executor, lila.core.config.RateLimit)(using scheduler: Scheduler):

  private val sequencer = AsyncActorSequencers[PuzzleId](
    maxSize = Max(64),
    expiration = 5.minutes,
    timeout = 5.seconds,
    name = "puzzle.finish",
    lila.mon.asyncActorMonitor.full
  )

  private val calculator = GlickoCalculator()

  def apply(
      id: PuzzleId,
      angle: PuzzleAngle,
      win: PuzzleWin,
      rated: Rated
  )(using me: Me, perf: Perf): Fu[Option[(PuzzleRound, Perf)]] =
    if api.casual(me.value, id) then
      fuccess:
        some:
          PuzzleRound(
            id = PuzzleRound.Id(me.userId, id),
            win = win,
            fixedAt = none,
            date = nowInstant
          ) -> perf
    else
      sequencer(id):
        api.round
          .find(me.value, id)
          .zip(api.puzzle.find(id))
          .flatMap:
            case (_, None) => fuccess(none)
            case (prevRound, Some(puzzle)) =>
              val now = nowInstant
              prevRound
                .match
                  case Some(prev) =>
                    fuccess:
                      (prev.updateWithWin(win), none, perf)
                  case None if rated.no =>
                    fuccess:
                      val round = PuzzleRound(
                        id = PuzzleRound.Id(me.userId, puzzle.id),
                        win = win,
                        fixedAt = none,
                        date = now
                      )
                      (round, none, perf)
                  case None =>
                    // for rating computation, we treat the solve as a game
                    // where the player is white and the puzzle is black
                    val (userGlicko, puzzleGlicko) =
                      val players = ByColor(
                        perf.toGlickoPlayer,
                        chess.rating.glicko.Player(puzzle.glicko.cap, puzzle.plays, none)
                      )
                      calculator
                        .computeGame:
                          chess.rating.glicko.Game(players, chess.Outcome(Color.fromWhite(win.yes).some))
                        .map(_.map(_.glicko))
                        .fold(
                          err =>
                            logger.error(s"Failed to compute glicko for puzzle ${puzzle.id}", err)
                            players.map(_.glicko).toPair
                          ,
                          _.toPair
                        )
                    // LiGo (ADR 0025 section 4): lichess skips the puzzle's rating update when the player's
                    // puzzle rating is out of line with their chess rating (`dubiousPuzzle`). There is no
                    // second rating to compare with here, so only the rate limit applies.
                    val updatePuzzleGlicko = canUpdatePuzzleRating(me.userId, false)(true)
                    val newPuzzleGlicko = updatePuzzleGlicko.so:
                      ponder
                        .puzzle(
                          angle,
                          win,
                          puzzle.glicko -> puzzleGlicko
                            .copy(
                              rating = puzzleGlicko.rating
                                .atMost(puzzle.glicko.rating + lila.rating.Glicko.maxRatingDelta)
                                .atLeast(puzzle.glicko.rating - lila.rating.Glicko.maxRatingDelta)
                            )
                            .cap,
                          player = perf.glicko
                        )
                        .some
                        .filter(puzzle.glicko !=)
                        .filter(_.sanityCheck)
                    val round =
                      PuzzleRound(
                        id = PuzzleRound.Id(me.userId, puzzle.id),
                        win = win,
                        fixedAt = none,
                        date = now
                      )
                    val userPerf = perf
                      .addOrReset(lila.mon.puzzle.crazyGlicko, s"puzzle ${puzzle.id}")(userGlicko, now)
                      .pipe: p =>
                        p.copy(glicko = ponder.player(angle, win, perf.glicko -> p.glicko, puzzle.glicko))
                    fuccess((round, newPuzzleGlicko, userPerf))
                .flatMap: (round, newPuzzleGlicko, userPerf) =>
                  import lila.rating.Glicko.glickoHandler
                  for
                    _ <- api.round
                      .upsert(round, angle)
                      .zip:
                        (userPerf != perf).so:
                          userApi
                            .setPerf(me.userId, PerfType.Puzzle, userPerf.clearRecent)
                            .zip(historyApi.addPuzzle(user = me.value, completedAt = now, perf = userPerf))
                            .void
                    _ <- colls.puzzle.map:
                      _.updateUnchecked(
                        bid(puzzle.id),
                        inc(Puzzle.BSONFields.plays -> bint(1)) ++ newPuzzleGlicko.so { glicko =>
                          set(Puzzle.BSONFields.glicko -> glicko)
                        }
                      )
                    _ = if prevRound.isEmpty then
                      Bus.pub:
                        Puzzle.UserResult(
                          puzzle.id,
                          me.userId,
                          win,
                          perf.intRating -> userPerf.intRating
                        )
                  yield (round -> userPerf).some

  private val canUpdatePuzzleRating =
    lila.memo.RateLimit[UserId](300, 1.day, key = "puzzle.canUpdatePuzzleRating")

  private object ponder:

    // LiGo: lichess's lists named chess themes. Where the position is (corner, edge, centre) and what
    // the goal is (life and death, living, killing) don't hint at the solution; the others do.
    private val nonHintingThemes: Set[PuzzleTheme.Key] = Set(
      PuzzleTheme.lifeAndDeath,
      PuzzleTheme.living,
      PuzzleTheme.killing,
      PuzzleTheme.corner,
      PuzzleTheme.edge,
      PuzzleTheme.centre
    ).map(_.key)

    private def isHinting(theme: PuzzleTheme.Key) = !nonHintingThemes(theme)

    // themes that make the solution very obvious: lichess's were one-move mates and the like. A Go
    // theme names a technique, not the move, so none does.
    private val isObvious: Set[PuzzleTheme.Key] = Set.empty

    private def weightOf(angle: PuzzleAngle, win: PuzzleWin) =
      angle.asTheme.fold(1f): theme =>
        if theme == PuzzleTheme.mix.key then 1
        else if isObvious(theme) then if win.yes then 0.1f else 0.4f
        else if isHinting(theme) then if win.yes then 0.2f else 0.7f
        else if win.yes then 0.7f
        else 0.8f

    def player(angle: PuzzleAngle, win: PuzzleWin, glicko: (Glicko, Glicko), puzzle: Glicko) =
      val provisionalPuzzle = puzzle.provisional.yes.so:
        if win.yes then -0.2f else -0.7f
      glicko._1.average(glicko._2, (weightOf(angle, win) + provisionalPuzzle).atLeast(0.1f))

    def puzzle(angle: PuzzleAngle, win: PuzzleWin, glicko: (Glicko, Glicko), player: Glicko) =
      if player.clueless then glicko._1
      else glicko._1.average(glicko._2, weightOf(angle, win))

  def incPuzzlePlays(puzzleId: PuzzleId): Funit =
    colls.puzzle.map(_.incFieldUnchecked(bid(puzzleId), Puzzle.BSONFields.plays))
