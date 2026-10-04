package lila.round

import chess.Color

import java.util.concurrent.TimeUnit

import lila.common.Bus
import lila.core.round.*
import lila.game.GameExt.{ applyGoMove, goClockActiveAfter, goPlayEnds, stepGoClock }
import lila.game.actorApi.MoveGameEvent
import lila.game.Progress
import lila.round.RoundGame.*

final private class MovePlayer(
    finisher: Finisher,
    goScorer: GoScorer,
    scheduleExpiration: ScheduleExpiration
)(using Executor):

  /** A Go stone or pass (ADR 0019 §5–7): checked by go-rules, and the clock stepped as scalachess stepped it
    * for a chess move. The second consecutive pass, or the ply cap, opens the scoring phase (ADR 0020 §3).
    */
  private[round] def goHuman(play: HumanGoPlay, round: RoundAsyncActor)(pov: Pov)(using
      proxy: GameProxy
  ): Fu[Events] =
    import pov.{ game, color }
    if game.playableBy(color) then
      game.go(play.action) match
        case Left(refusal) => fufail(ClientError(s"$pov ${refusal.key}"))
        case Right(next) =>
          // only the move reaching the ply cap ends play for good and earns no increment
          val stepped = game.stepGoClock(play.moveMetrics, gameActive = game.goClockActiveAfter(next))
          if stepped.exists(_.value.outOfTime(color, withGrace = false)) then finisher.outOfTime(game)
          else
            stepped
              .flatMap(_.compensated)
              .foreach: lag =>
                lila.mon.round.move.lag.moveComp.record(lag.millis, TimeUnit.MILLISECONDS)
            val progress = game.applyGoMove(next, stepped.map(_.value), play.blur)
            for
              _ <- proxy.save(progress)
              events <- postGoPlay(round, progress, pov)
            yield events
    else if game.finished then fufail(GameIsFinishedError(game.id))
    else if game.aborted then fufail(ClientError(s"$pov game is aborted"))
    else if !game.turnOf(color) then fufail(ClientError(s"$pov not your turn"))
    else fufail(ClientError(s"$pov move refused for some reason"))

  private def postGoPlay(round: RoundAsyncActor, progress: Progress, pov: Pov)(using
      GameProxy
  ): Fu[Events] =
    val game = progress.game
    val action = game.go.actions.lastOption.fold("pass")(lila.core.game.GoBridge.token)
    notifyGoMove(game, action, pov.color)
    if pov.opponent.isProposingTakeback then round ! RoundBus.Takeback(pov.player.id, false)
    goScorer.afterMove(game) match
      case Some(opened) => opened.dmap(progress.events ::: _)
      case None =>
        scheduleExpiration.exec(game)
        fuccess(progress.events)

  private def notifyGoMove(game: Game, action: String, color: Color): Unit =
    import lila.core.round.MoveEvent
    val board = lila.core.game.GoBridge.board(game.go)
    Bus.publishDyn(MoveGameEvent(game, board, action), MoveGameEvent.makeChan(game.id))
    publishMove(game, MoveEvent(game.id, board, action), color)

  private def publishMove(game: Game, moveEvent: lila.core.round.MoveEvent, color: Color): Unit =
    import lila.core.round.{ CorresMoveEvent, SimulMoveEvent }

    // publish correspondence moves
    if game.isCorrespondence && game.nonAi then
      // the move that opens the scoring phase is no "your turn" and sets no day-clock alarm: the phase's
      // own push and alarms take over once the proposal arrives (ADR 0023 §4)
      val opensScoring = game.goPlayEnds
      Bus.pub:
        CorresMoveEvent(
          move = moveEvent,
          playerUserId = game.player(color).userId,
          mobilePushable = game.mobilePushable && !opensScoring,
          alarmable = game.alarmable && !opensScoring,
          unlimited = game.isUnlimited
        )

    // publish simul moves
    for
      simulId <- game.simulId
      opponentUserId <- game.player(!color).userId
      event = SimulMoveEvent(move = moveEvent, simulId = simulId, opponentUserId = opponentUserId)
    yield Bus.pub(event)
