package lila.core
package game

import _root_.chess.{ Color, Ply }
import ligo.gorules.{ Action, Color as GoColor, GoGame, Point, Ruleset, Setup }

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

  /** A move's token on the wire (ADR 0019 §6): an SGF point such as `pd`, or `pass`. */
  def actionOf(token: String): Option[Action] =
    if token == "pass" then Some(Action.Pass) else Point.fromSgf(token).map(Action.Place(_))

  def token(a: Action): String = a match
    case Action.Place(at) => at.sgf
    case Action.Pass => "pass"
    case Action.Resume => "resume"

  /** A point as players read it, e.g. `D4`: the column letter (A to T, skipping I, as on printed boards and
    * in GTP) and the row counted from the bottom. `lines` is the board's size.
    */
  def label(at: Point, lines: Int): String =
    val column = ('A' + at.col + (if at.col >= 8 then 1 else 0)).toChar
    s"$column${lines - at.row}"

  /** An action as players read it: `D4`, `pass` or `resume`. */
  def label(a: Action, lines: Int): String = a match
    case Action.Place(at) => label(at, lines)
    case other => token(other)

  /** A setup as players read it, e.g. `9×9 • Japanese • komi 6.5 • 2 stones`. */
  def setupName(s: Setup): String =
    val rules = s.ruleset match
      case Ruleset.Japanese => "Japanese"
      case Ruleset.Chinese => "Chinese"
    val komi = if s.komi == s.komi.toInt then s.komi.toInt.toString else s.komi.toString
    val handicap = Option.when(s.handicap > 0)(s"${s.handicap} stones")
    (List(s"${s.size.lines}×${s.size.lines}", rules, s"komi $komi") ++ handicap).mkString(" • ")

  /** The position as a compact string for live mini boards (ADR 0019 §6): rows from the top, separated by
    * `/`, `b` and `w` for stones and a number for a run of empty points, e.g. `9/9/2b6/…`.
    */
  def board(g: GoGame): String =
    val stones = g.stones
    val lines = g.size.lines
    (0 until lines)
      .map: row =>
        val sb = StringBuilder()
        var empty = 0
        for col <- 0 until lines do
          stones.get(Point(col, row)) match
            case None => empty += 1
            case Some(c) =>
              if empty > 0 then sb.append(empty)
              empty = 0
              sb.append(if c == GoColor.Black then 'b' else 'w')
        if empty > 0 then sb.append(empty)
        sb.toString
      .mkString("/")

  /** A Go mini game's `data-state` (unit 3.19, read by ui/lib's miniBoard.ts): the board, the player to
    * move, the last stone or pass (empty before the first one) and the plies played, which tell the page
    * whether the clocks run yet. `blind` shows an empty board, as chess mini games do for a blindfold player.
    */
  def miniState(g: GoGame, blind: Boolean): String =
    s"${miniBoard(g, blind)},${color(g.toMove).name},${lastMove(g)},${plies(g)}"

  /** The mini board: the position, or an empty board of the same size for a blindfold player. */
  def miniBoard(g: GoGame, blind: Boolean): String =
    if blind then List.fill(g.size.lines)(g.size.lines.toString).mkString("/") else board(g)

  /** The last stone (an SGF point) or `pass`, empty before the first; a resume isn't a move. */
  def lastMove(g: GoGame): String = g.actions.filterNot(_ == Action.Resume).lastOption.fold("")(token)

  /** The points whose stones `after` removed from `before`: what one placement captured. */
  def captured(before: GoGame, after: GoGame): List[Point] =
    val left = after.stones
    before.stones.keys.filterNot(left.contains).toList.sortBy(p => (p.row, p.col))
