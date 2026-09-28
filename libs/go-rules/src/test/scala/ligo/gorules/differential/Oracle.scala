package ligo.gorules.differential

import ligo.gorules.*

// Licence: MIT (LiGo's own code, ADR 0006).

/** What the differential test asks of the engine it checks the adapter against (KataGo in the nightly run).
  * It follows the same game one action at a time and answers the same questions the adapter does.
  */
trait Oracle:

  /** A fresh game: the board size, komi and the stones already on the board (handicap stones, all Black, with
    * White to play first); no stones means Black plays first.
    */
  def newGame(size: BoardSize, komi: Double, handicapStones: Set[Point]): Unit

  /** `color` places a stone at `at`, or passes when `at` is empty. */
  def play(color: Color, at: Option[Point]): Unit

  /** Takes the last move or pass back. */
  def undo(): Unit

  /** Empty points where the player to move may place a stone. */
  def legalPoints: Set[Point]

  def position: OraclePosition

  /** The area score of the finished game with every stone alive, White minus Black, komi included. */
  def finalScore: Double

/** Stones on the board, whose turn it is and how many stones each player has captured (`captures.black` is
  * the number of White stones Black took, as in the adapter).
  */
final case class OraclePosition(stones: Map[Point, Color], toMove: Color, captures: Captures)
