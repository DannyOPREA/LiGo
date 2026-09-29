package lila.round

import chess.format.{ Fen, Uci }
import chess.{ Centis, Clock, ErrorStr, MoveMetrics, MoveOrDrop, Status }

import java.util.concurrent.TimeUnit

import lila.common.Bus
import lila.core.round.*
import lila.game.GameExt.applyMove
import lila.game.actorApi.MoveGameEvent
import lila.game.Progress
import lila.round.RoundGame.*

final private class MovePlayer(
    finisher: Finisher,
    scheduleExpiration: ScheduleExpiration
)(using Executor):

  sealed private trait MoveResult
  private case object Flagged extends MoveResult
  private case class MoveApplied(progress: Progress, move: MoveOrDrop, compedLag: Option[Centis])
      extends MoveResult

  private[round] def human(play: HumanPlay, round: RoundAsyncActor)(
      pov: Pov
  )(using proxy: GameProxy): Fu[Events] =
    import pov.{ game, color }
    if game.ply > lila.game.Game.maxPlies then
      round ! TooManyPlies
      fuccess(Nil)
    else if game.playableBy(color) then
      applyUci(game, play.uci, play.blur, play.moveMetrics)
        .leftMap(e => s"$pov $e")
        .fold(errs => fufail(ClientError(errs)), fuccess)
        .flatMap:
          case Flagged => finisher.outOfTime(game)
          case MoveApplied(progress, moveOrDrop, compedLag) =>
            compedLag.foreach: lag =>
              lila.mon.round.move.lag.moveComp.record(lag.millis, TimeUnit.MILLISECONDS)
            proxy.save(progress) >>
              postHumanPlay(round, pov, progress, moveOrDrop)
    else if game.finished then fufail(GameIsFinishedError(game.id))
    else if game.aborted then fufail(ClientError(s"$pov game is aborted"))
    else if !game.turnOf(color) then fufail(ClientError(s"$pov not your turn"))
    else fufail(ClientError(s"$pov move refused for some reason"))

  private def postHumanPlay(
      round: RoundAsyncActor,
      pov: Pov,
      progress: Progress,
      moveOrDrop: MoveOrDrop
  )(using GameProxy): Fu[Events] =
    notifyMove(moveOrDrop, progress.game)
    if progress.game.finished then moveFinish(progress.game).dmap { progress.events ::: _ }
    else
      if pov.opponent.isOfferingDraw then round ! RoundBus.Draw(pov.player.id, false)
      if pov.opponent.isProposingTakeback then round ! RoundBus.Takeback(pov.player.id, false)
      if progress.game.forecastable then round ! ForecastPlay(moveOrDrop)
      scheduleExpiration.exec(progress.game)
      fuccess(progress.events)

  private def applyUci(
      game: Game,
      uci: Uci,
      blur: Boolean,
      metrics: MoveMetrics
  ): Either[ErrorStr, MoveResult] =
    uci
      .match
        case Uci.Move(orig, dest, prom) =>
          game.chess.moveWithCompensated(orig, dest, prom, metrics)
        case Uci.Drop(role, pos) =>
          game.chess.drop(role, pos, metrics).map((ncg, drop) => Clock.WithCompensatedLag(ncg, None) -> drop)
      .map:
        case (ncg, _) if ncg.value.clock.exists(_.outOfTime(game.turnColor, withGrace = false)) => Flagged
        case (ncg, moveOrDrop: MoveOrDrop) =>
          MoveApplied(
            game.applyMove(ncg.value, moveOrDrop, blur),
            moveOrDrop,
            ncg.compensated
          )

  private def notifyMove(moveOrDrop: MoveOrDrop, game: Game): Unit =
    import lila.core.round.{ CorresMoveEvent, MoveEvent, SimulMoveEvent }
    val color = moveOrDrop.color
    val moveEvent = MoveEvent(
      gameId = game.id,
      fen = Fen.write(game.chess),
      move = moveOrDrop.toUci
    )

    // I checked and the bus doesn't do much if there's no subscriber for a classifier,
    // so we should be good here.
    // also used for targeted TvBroadcast subscription
    Bus.publishDyn(MoveGameEvent(game, moveEvent.fen, moveEvent.move), MoveGameEvent.makeChan(game.id))

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

  private def moveFinish(game: Game)(using GameProxy): Fu[Events] =
    game.status match
      case Status.Mate => finisher.other(game, _.Mate, game.position.winner)
      case Status.VariantEnd => finisher.other(game, _.VariantEnd, game.position.winner)
      case status @ (Status.Stalemate | Status.Draw) => finisher.other(game, _ => status, None)
      case _ => fuccess(Nil)
