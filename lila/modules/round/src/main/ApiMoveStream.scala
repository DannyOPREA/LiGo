package lila.round

import org.apache.pekko.stream.scaladsl.*
import chess.format.{ UciDump, Fen }
import chess.{ ByColor, Centis, Color, Position }
import play.api.libs.json.*

import lila.common.Bus
import lila.common.Json.given
import lila.core.game.{ FinishGame, GoBridge }
import lila.game.GameRepo
import lila.game.actorApi.MoveGameEvent

final class ApiMoveStream(
    gameRepo: GameRepo,
    gameJsonView: lila.game.JsonView,
    lightUserApi: lila.user.LightUserApi
)(using Executor):

  private val delayMovesBy = 3

  def apply(game: Game, delayMoves: Boolean): Source[JsObject, ?] =
    val delayingMoves = delayMoves && game.hasClock && game.playable
    Source.futureSource:
      for
        initialFen <- gameRepo.initialFen(game)
        lightUsers <- lightUserApi.asyncManyOptions(game.players.mapList(_.userId))
      yield
        def makeGameJson(g: Game, full: Boolean) =
          val base =
            if full then gameJsonView.base(g, initialFen)
            else gameJsonView.immutable(g, initialFen)
          base ++ Json.obj(
            "players" -> JsObject(g.players.all.zip(lightUsers).map { (p, user) =>
              p.color.name -> gameJsonView.player(p, user)
            })
          )
        Source(List(makeGameJson(game, full = false))).concat(
          Source
            .queue[JsObject](
              (game.ply.value + delayMovesBy).atLeast(16),
              org.apache.pekko.stream.OverflowStrategy.dropHead
            )
            .mapMaterializedValue: queue =>
              val clocks =
                for
                  clk <- game.clock
                  clkHistory <- game.clockHistory
                yield clkHistory.map(Vector(clk.config.initTime) ++ _)
              val clockOffset = game.startColor.fold(0, 1)
              def clockAt(index: Int): Option[ByColor[Centis]] =
                for
                  c <- clocks
                  white <- c.white.lift((index + 1 - clockOffset) >> 1)
                  black <- c.black.lift((index + clockOffset) >> 1)
                yield ByColor(white, black)
              game.go match
                // A Go game: its board after each action from the start, with the move's SGF point or
                // `pass` (unit 3.16).
                case Some(go) =>
                  lila.game.JsonView
                    .goBoards(go)
                    .foreach:
                      _.zipWithIndex.foreach: (board, index) =>
                        val lastMove = (index > 0).so(go.actions.lift(index - 1).map(GoBridge.token))
                        queue.offer(goJson(board, (game.startedAtPly + index).turn, lastMove, clockAt(index)))
                case None =>
                  Position(game.variant, initialFen)
                    .playPositions(game.sans)
                    .foreach {
                      _.zipWithIndex.foreach: (s, index) =>
                        queue.offer(
                          toJson(
                            Fen.write(s, (game.startedAtPly + index).fullMoveNumber).value,
                            s.history.lastMove.map(UciDump.lastMove(_, s)),
                            clockAt(index)
                          )
                        )
                    }
              if game.finished then
                queue.offer(makeGameJson(game, full = true))
                queue.complete()
              else
                val chan = MoveGameEvent.makeChan(game.id)
                val subEvent = Bus.subscribeFunDyn(chan):
                  case MoveGameEvent(g, position, lastMove) =>
                    val clock = g.clock.map(clk => ByColor(clk.remainingTime))
                    queue.offer:
                      if g.isGo then goJson(position, g.turnColor, lastMove.some, clock)
                      else toJson(position, lastMove.some, clock)
                val subFinish = Bus.sub[FinishGame]:
                  case FinishGame(g, _) if g.id == game.id =>
                    queue.offer(makeGameJson(g, full = true))
                    if delayingMoves then for _ <- 1 to delayMovesBy do queue.offer(Json.obj())
                    queue.complete()
                queue
                  .watchCompletion()
                  .addEffectAnyway:
                    Bus.unsubscribeDyn(subEvent, List(chan))
                    Bus.unsub[FinishGame](subFinish)
            .pipe: source =>
              if delayingMoves
              then source.sliding(delayMovesBy + 1).mapConcat(_.headOption)
              else source
        )
  end apply

  private def withClock(js: JsObject, clock: Option[ByColor[Centis]]): JsObject =
    clock.fold(js): clk =>
      js ++ Json.obj("wc" -> clk.white.roundSeconds, "bc" -> clk.black.roundSeconds)

  private def toJson(fen: String, lastMove: Option[String], clock: Option[ByColor[Centis]]): JsObject =
    withClock(Json.obj("fen" -> fen).add("lm" -> lastMove), clock)

  /** A Go position as live mini boards receive it (ADR 0019 §6): the compact board, the player to move, the
    * last move's SGF point or `pass`, and the clocks.
    */
  private def goJson(
      board: String,
      turn: Color,
      lastMove: Option[String],
      clock: Option[ByColor[Centis]]
  ): JsObject =
    withClock(Json.obj("board" -> board, "turn" -> turn.name).add("lm" -> lastMove), clock)
