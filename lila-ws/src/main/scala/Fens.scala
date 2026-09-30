package lila.ws

import cats.syntax.option.*
import chess.Color
import org.apache.pekko.actor.typed.ActorRef
import play.api.libs.json.*

import scala.util.Try

import lila.ws.ipc.*

/* Manages subscriptions to live mini-board updates (TV, game lists). The name is upstream's; in LiGo
 * the updates are Go boards (ADR 0019 §6). */
object Fens:

  case class Watched(position: Option[MiniBoard], clients: Set[ActorRef[ClientMsg]])

  private val games = scalalib.ConcurrentMap[Game.Id, Watched](1024)
  export games.size

  // client starts watching
  def watch(gameIds: Iterable[Game.Id], client: Client): Unit =
    gameIds.foreach: gameId =>
      games
        .compute(gameId):
          case None => Watched(None, Set(client)).some
          case Some(Watched(square, clients)) => Watched(square, clients + client).some
        .flatMap(_.position)
        .foreach: p =>
          client ! ClientIn.Fen(gameId, p)

  // when a client disconnects
  def unwatch(gameIds: Iterable[Game.Id], client: Client): Unit =
    gameIds.foreach: gameId =>
      games.computeIfPresent(gameId): watched =>
        val newClients = watched.clients - client
        Option.when(newClients.nonEmpty)(watched.copy(clients = newClients))

  // a game finishes
  def finish(gameId: Game.Id, winner: Option[Color]) =
    games.computeIfPresent(gameId): watched =>
      watched.clients.foreach { _ ! ClientIn.Finish(gameId, winner) }
      none

  // move coming from the server
  def move(gameId: Game.Id, json: JsonString, moveBy: Option[Color]): Unit =
    games.computeIfPresent(gameId): watched =>
      readMove(json, moveBy)
        .fold(watched): board =>
          val msg = ClientIn.Fen(gameId, board)
          watched.clients.foreach { _ ! msg }
          watched.copy(position = Some(board))
        .some

  /* Reads lila's Go move event (ADR 0019 §6), e.g.
   * {"p":"ee","ply":2,"cap":[],"prisoners":{"b":0,"w":0},"phase":"play","board":"9/9/9/9/4b4/9/9/9/9",
   *  "clock":{"white":61.5,"black":60}}
   * or {"pass":true,...}. A byo-yomi clock adds "periods":{"b":n,"w":n} and "byo" (ADR 0020 §7).
   * Only games someone watches are read. */
  private[ws] def readMove(json: JsonString, moveBy: Option[Color]): Option[MiniBoard] =
    Try(Json.parse(json.value)).toOption
      .collect { case o: JsObject => o }
      .flatMap: o =>
        for
          lastMove <- o
            .str("p")
            .flatMap(GoMove.read)
            .orElse(o.boolean("pass").filter(identity).map(_ => GoMove.pass))
          board <- o.str("board").filter(BoardShape.matches)
          clock = o
            .obj("clock")
            .flatMap: c =>
              for
                white <- (c \ "white").asOpt[Double]
                black <- (c \ "black").asOpt[Double]
                periods = for
                  w <- (c \ "periods" \ "w").asOpt[Int]
                  b <- (c \ "periods" \ "b").asOpt[Int]
                yield (w, b)
              yield Clock(white.toInt, black.toInt, periods)
        yield MiniBoard(lastMove, board, clock, moveBy.fold(Color.black)(c => !c))

  private val BoardShape = "[0-9bw/]+".r
