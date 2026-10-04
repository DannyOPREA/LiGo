package lila.game

import lila.core.game.GameExport.WithFlags

// What used to live beside the chess PGN writer (unit 3.17 part 2a): the export flags and the move delay
// that keeps a game being watched live a few moves behind.
object GameExport:

  export lila.core.game.GameExport.*

  private val delayMovesBy = 3
  private val delayKeepsFirstMoves = 5

  def applyDelay[M](moves: Seq[M], flags: WithFlags): Seq[M] =
    if !flags.delayMoves then moves
    else moves.take((moves.size - delayMovesBy).atLeast(delayKeepsFirstMoves))
