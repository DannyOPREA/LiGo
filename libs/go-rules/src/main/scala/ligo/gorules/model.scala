package ligo.gorules

// The adapter's own vocabulary. lila sees only these types; strategygames' types stay inside
// GoGame (ADR 0012). Rule IDs (R-...) refer to docs/rules/spec.md.
// Licence: MIT (LiGo's own code, ADR 0006).

enum Color:
  case Black, White

  def opposite: Color = if this == Black then White else Black

/** Japanese (territory) or Chinese (area) rules, chosen per game (R-SCOPE-2). The two differ only in komi and
  * in how the final score is counted, which goscorer does (R-SCORE-3), not in which moves are legal.
  */
enum Ruleset:
  case Japanese, Chinese

enum BoardSize(val lines: Int):
  case Nine extends BoardSize(9)
  case Thirteen extends BoardSize(13)
  case Nineteen extends BoardSize(19)

  def points: Int = lines * lines

  def contains(p: Point): Boolean = p.col >= 0 && p.row >= 0 && p.col < lines && p.row < lines

object BoardSize:
  def apply(lines: Int): Option[BoardSize] = values.find(_.lines == lines)

/** An intersection, counted from the top-left corner (column, row), both from 0: the same origin as SGF
  * coordinates (R-BOARD-4), so `Point(3, 3)` is `dd`.
  */
final case class Point(col: Int, row: Int):
  def sgf: String = s"${('a' + col).toChar}${('a' + row).toChar}"

object Point:
  def fromSgf(s: String): Option[Point] =
    Option.when(s.length == 2 && s.forall(c => c >= 'a' && c <= 's'))(Point(s(0) - 'a', s(1) - 'a'))

/** Play, or the scoring phase that two consecutive passes open (R-END-1, R-SP-1). The end of the game
  * (acceptance, timeout, resignation) is lila's to decide, so it is not a phase here.
  */
enum Phase:
  case Play, Scoring

/** What a player did. `Resume` is a player taking the game back from the scoring phase to play (R-SP-6); it
  * is not a move and records no situation.
  */
enum Action:
  case Place(at: Point)
  case Pass
  case Resume

/** Why an action was refused (R-MOVE-8: nothing changes). `key` is the reason's name in the conformance
  * fixtures (libs/conformance/README.md).
  */
enum Refusal(val key: String):
  case OffBoard extends Refusal("off-board")
  case Occupied extends Refusal("occupied")
  case Suicide extends Refusal("suicide")
  case Superko extends Refusal("superko")
  case InScoring extends Refusal("in-scoring")
  case NotInScoring extends Refusal("not-in-scoring")
  case ResumeLimit extends Refusal("resume-limit")
  case NothingToUndo extends Refusal("nothing-to-undo")
  case PlayClosed extends Refusal("play-closed")

/** Stones each player has captured during play: `black` counts the White stones Black took. */
final case class Captures(black: Int, white: Int)

/** A starting position other than the empty board: the stones and who moves first. It is the game's starting
  * situation (R-KO-2), not moves played.
  */
final case class Position(stones: Map[Point, Color], toMove: Color)

/** Everything that fixes how a game starts.
  *
  * @param handicap
  *   0, or 1 (no stone placed, Black moves first, R-HCP-2), or 2 to 9 stones on the fixed points of R-HCP-4
  *   with White moving first (R-HCP-3).
  * @param komi
  *   added to White's score; a multiple of 0.5 whose size is at most the number of points on the board
  *   (R-KOMI-4). [[Komi.standard]] gives the value rated games use.
  * @param position
  *   a custom starting position (analysis, puzzles, tests); it cannot be combined with handicap stones.
  */
final case class Setup(
    size: BoardSize,
    ruleset: Ruleset,
    komi: Double,
    handicap: Int = 0,
    position: Option[Position] = None
)

enum SetupError(val message: String):
  case HandicapOutOfRange(handicap: Int) extends SetupError(s"handicap must be 0 to 9, not $handicap")
  case HandicapWithPosition extends SetupError("handicap stones cannot be combined with a custom position")
  case BadKomi(komi: Double)
      extends SetupError(s"komi must be a multiple of 0.5 no bigger than the board, not $komi")
  case StoneOffBoard(at: Point) extends SetupError(s"stone off the board at ${at.sgf}")
  case StonesWithoutLiberty(at: Point)
      extends SetupError(s"the chain at ${at.sgf} has no liberties in the starting position")
  case BadByoyomi(config: ByoyomiConfig) extends SetupError(s"invalid byo-yomi settings: $config")

object Komi:

  /** The komi rated games use (R-KOMI-1, R-KOMI-2): 0.5 with any handicap, otherwise 6.5 under Japanese and
    * 7.5 under Chinese rules. Chinese handicap compensation (R-KOMI-3) is not komi: the score count adds it
    * (R-SCORE-4).
    */
  def standard(ruleset: Ruleset, handicap: Int): Double =
    if handicap > 0 then 0.5
    else
      ruleset match
        case Ruleset.Japanese => 6.5
        case Ruleset.Chinese => 7.5

  def isValid(komi: Double, size: BoardSize): Boolean =
    (komi * 2).isWhole && komi.abs <= size.points
