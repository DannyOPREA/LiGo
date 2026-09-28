package ligo.gorules.differential

import strategygames.Player
import strategygames.go.{ Board, Piece, Pos, Role }
import strategygames.go.variant.{ Go13x13, Go19x19, Go9x9 }

import ligo.gorules.*

// Licence: MIT (LiGo's own code, ADR 0006).

/** The server engine's own area count of a finished random game, for the comparison with KataGo's.
  *
  * The adapter exposes no score: LiGo's final score is goscorer's, in services/scoring (R-SCORE-3, ADR 0016,
  * Phase 4). So the differential test reads strategygames' area count directly (test code only): every stone
  * counts as alive, which is right for these games, whose ends leave no dead stones to agree on.
  */
object EngineScore:

  def whiteMinusBlack(game: GoGame): Double =
    val size = game.size
    val variant = size match
      case BoardSize.Nine => Go9x9
      case BoardSize.Thirteen => Go13x13
      case BoardSize.Nineteen => Go19x19
    val pieces = game.stones.map: (p, c) =>
      Pos.at(p.col, size.lines - 1 - p.row).get -> Piece(
        if c == Color.Black then Player.P1 else Player.P2,
        Role.defaultRole
      )
    // strategygames counts in tenths of a point and adds the board's komi to White (P2).
    val area = Board(pieces, variant).copy(komi = game.setup.komi).areaScore
    (area.p2 - area.p1) / 10.0
