package lila.round

import chess.Color

import java.util.concurrent.TimeUnit

import lila.common.Bus
import lila.core.round.*
import lila.game.GameExt.{ applyGoMove, goPlayEnds, stepGoClock }
import lila.game.actorApi.MoveGameEvent
import lila.game.Progress
import lila.round.RoundGame.*

final private class MovePlayer(
    finisher: Finisher,
    scheduleExpiration: ScheduleExpiration
)(using Executor):

  /** A Go stone or pass (ADR 0019 §5–7): checked by go-rules, the clock stepped as scalachess stepped it for
    * a chess move, and the game ended with no winner on the second consecutive pass or at the ply cap (Phase
    * 3 has no scoring phase).
    */
  private[round] def goHuman(play: HumanGoPlay, round: RoundAsyncActor)(pov: Pov)(using
      proxy: GameProxy
  ): Fu[Events] =
    import pov.{ game, color }
    if game.playableBy(color) then
      game.go(play.action) match
        case Left(refusal) => fufail(ClientError(s"$pov ${refusal.key}"))
        case Right(next) =>
          // the move that ends the game earns no increment
          val stepped = game.stepGoClock(play.moveMetrics, gameActive = !game.withGo(next).goPlayEnds)
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
    if game.goPlayEnds then finisher.other(game, _.UnknownFinish, None).dmap(progress.events ::: _)
    else
      if pov.opponent.isProposingTakeback then round ! RoundBus.Takeback(pov.player.id, false)
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
      Bus.pub:
        CorresMoveEvent(
          move = moveEvent,
          playerUserId = game.player(color).userId,
          mobilePushable = game.mobilePushable,
          alarmable = game.alarmable,
          unlimited = game.isUnlimited
        )

    // publish simul moves
    for
      simulId <- game.simulId
      opponentUserId <- game.player(!color).userId
      event = SimulMoveEvent(move = moveEvent, simulId = simulId, opponentUserId = opponentUserId)
    yield Bus.pub(event)
