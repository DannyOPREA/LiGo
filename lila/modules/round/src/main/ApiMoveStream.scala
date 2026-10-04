package lila.round

import org.apache.pekko.stream.scaladsl.*
import chess.{ ByColor, Centis, Color }
import play.api.libs.json.*

import lila.common.Bus
import lila.common.Json.given
import lila.core.game.{ FinishGame, GoBridge }
import lila.game.actorApi.MoveGameEvent

final class ApiMoveStream(
    gameJsonView: lila.game.JsonView,
    lightUserApi: lila.user.LightUserApi
)(using Executor):

  private val delayMovesBy = 3

  def apply(game: Game, delayMoves: Boolean): Source[JsObject, ?] =
    val delayingMoves = delayMoves && game.hasClock && game.playable
    Source.futureSource:
      for lightUsers <- lightUserApi.asyncManyOptions(game.players.mapList(_.userId))
      yield
        def makeGameJson(g: Game, full: Boolean) =
          val base =
            if full then gameJsonView.base(g)
            else gameJsonView.immutable(g)
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
              // the game's board from the start and after each move (unit 3.16)
              ApiMoveStream
                .goFrames(game.go)
                .foreach:
                  _.foreach: f =>
                    queue.offer(goJson(f.board, f.turn, f.lastMove, clockAt(f.plyIndex)))
              if game.finished then
                queue.offer(makeGameJson(game, full = true))
                queue.complete()
              else
                val chan = MoveGameEvent.makeChan(game.id)
                val subEvent = Bus.subscribeFunDyn(chan):
                  case MoveGameEvent(g, position, lastMove) =>
                    val clock = g.clock.map(clk => ByColor(clk.remainingTime))
                    queue.offer(goJson(position, g.turnColor, lastMove.some, clock))
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

object ApiMoveStream:

  /** One position of a Go game's stream: its compact board (`GoBridge.board`), the player to move, the move
    * that led to it (an SGF point or `pass`; none at the start) and its index among the game's plies, which
    * picks its clock times.
    */
  case class GoFrame(board: String, turn: Color, lastMove: Option[String], plyIndex: Int)

  /** A Go game's positions: the start, then one after each placement or pass. Resuming from the scoring phase
    * is not a ply (ADR 0019 §3) and changes neither the board nor the player to move, so it sends none. None
    * if the setup can't be started or an action is refused, which a stored game never has.
    */
  def goFrames(go: ligo.gorules.GoGame): Option[Vector[GoFrame]] =
    ligo.gorules.GoGame
      .start(go.setup)
      .toOption
      .flatMap: start =>
        val first = GoFrame(GoBridge.board(start), GoBridge.color(start.toMove), none, 0)
        go.actions
          .foldLeft(Option(Vector(first) -> start)): (acc, action) =>
            acc.flatMap: (frames, g) =>
              g(action).toOption.map: next =>
                if action == ligo.gorules.Action.Resume then frames -> next
                else
                  val frame = GoFrame(
                    GoBridge.board(next),
                    GoBridge.color(next.toMove),
                    GoBridge.token(action).some,
                    frames.size
                  )
                  (frames :+ frame) -> next
          .map(_._1)
