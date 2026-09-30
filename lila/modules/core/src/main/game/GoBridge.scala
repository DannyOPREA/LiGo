package lila.core
package game

import _root_.chess.{ Color, Ply }
import ligo.gorules.{ Action, Color as GoColor, GoGame }

import lila.core.perf.PerfKey

/** Where lila's types meet libs/go-rules' (ADR 0019 §2). lila keeps `chess.Color` everywhere (Go's Black is
  * `chess.Black`), never imports `ligo.gorules.*` wholesale (its `Color` would shadow lila's), and converts
  * here.
  */
object GoBridge:

  def color(c: GoColor): Color = c match
    case GoColor.Black => Color.Black
    case GoColor.White => Color.White

  def goColor(c: Color): GoColor = c.fold(GoColor.White, GoColor.Black)

  /** The ply a Go game starts at. lila decides whose turn it is from ply parity (even: White), so a game
    * whose first player is Black (an even game, handicap 1) starts at ply 1 and one whose first player is
    * White (handicap 2 to 9) at ply 0 (ADR 0019 §3). A custom position takes it from its player to move,
    * which `start.toMove` already is.
    */
  def startedAtPly(start: GoGame): Ply = if start.toMove == GoColor.White then Ply(0) else Ply(1)

  /** Every Go game is rated in the one `go` perf (ADR 0021 §1). */
  val perfKey: PerfKey = PerfKey.go

  /** Plies a Go game has played: placements and passes. Resuming from the scoring phase is not a ply (ADR
    * 0019 §3), so this is not the number of actions.
    */
  def plies(g: GoGame): Int = g.actions.count(_ != Action.Resume)

  /** The most plies a Go game may play (ADR 0019 §7): far beyond any real 19x19 game; reaching it ends play
    * as two passes do. lila's chess cap (`Game.maxPlies`, 600) forces a draw, which Go doesn't have.
    */
  val maxPlies: Int = 1000
