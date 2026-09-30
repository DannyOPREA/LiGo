package lila.game
package actorApi

import lila.core.game.Game

/** A move, for the API's move stream. `position` is the FEN after a chess move or the compact board
  * (`GoBridge.board`) after a Go one; `lastMove` is chess's last-move squares or the Go move's token (an SGF
  * point or `pass`), as the stream sends them (unit 3.16).
  */
case class MoveGameEvent(game: Game, position: String, lastMove: String)
object MoveGameEvent:
  def makeChan(gameId: GameId) = s"moveEvent:$gameId"

case class NotifyRematch(rematchOf: GameId, newGame: Game)
