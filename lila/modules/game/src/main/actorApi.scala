package lila.game
package actorApi

import chess.format.{ Uci, Fen }

import lila.core.game.Game

case class MoveGameEvent(game: Game, fen: Fen.Full, move: Uci)
object MoveGameEvent:
  def makeChan(gameId: GameId) = s"moveEvent:$gameId"

case class NotifyRematch(rematchOf: GameId, newGame: Game)
