package lila.core
package game

import _root_.chess.Color
import scalalib.model.Seconds

import lila.core.id.GameId
import lila.core.userId.UserIdOf

case class Pov(game: Game, color: Color):

  export game.id as gameId

  def player = game.player(color)

  def playerId = player.id

  def fullId = game.fullIdOf(color)

  def opponent = game.player(!color)

  def flip = copy(color = !color)

  def unary_! = flip

  def ref = PovRef(game.id, color)

  def withGame(g: Game) = copy(game = g)
  def withColor(c: Color) = copy(color = c)

  /** Whose move it is, or in the scoring phase (ADR 0023 §4) whether this player has yet to accept the count:
    * both players are "to move" until each has accepted, so the game shows in their "your turn" lists.
    * `GameRepo.countWhereUserTurn` (Query.userTurn) must agree.
    */
  lazy val isMyTurn =
    game.started && game.playable && game.goScoring.fold(game.turnColor == color): sc =>
      !sc.accepted(GoBridge.goColor(color))

  lazy val remainingSeconds: Option[Seconds] =
    game.gameClock
      .map(c => c.remainingTime(color).roundSeconds)
      .orElse:
        Seconds.from(game.playableCorrespondenceClock.map(_.remainingTime(color).toInt))

  def hasMoved = game.playerHasMoved(color)

  def moves = game.playerMoves(color)

  def win = game.wonBy(color)

  // In the scoring phase either player may claim the win when the other has left (ADR 0020 §3.7).
  def mightClaimWin = game.forceResignable && (!isMyTurn || game.inGoScoring)

  def sideAndStart = SideAndStart(color, game.startedAtPly)

  override def toString = ref.toString

object Pov:
  def naturalOrientation(game: Game): Pov = Pov(game, game.naturalOrientation)
  def apply(game: Game, player: Player): Pov = Pov(game, player.color)
  def apply[U: UserIdOf](game: Game, user: U): Option[Pov] =
    game.player(user).map { apply(game, _) }

case class PovRef(gameId: GameId, color: Color):
  def unary_! = PovRef(gameId, !color)
  override def toString = s"$gameId/${color.name}"
