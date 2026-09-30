package lila.game

import chess.ErrorStr
import chess.format.Fen
import monocle.syntax.all.*

object Rewind:

  def apply(game: CoreGame, initialFen: Option[Fen.Full]): Either[ErrorStr, Progress] =
    chess
      .Game(game.variant, initialFen)
      .forward(game.sans.dropRight(1))
      .map: rewindedGame =>
        val color = game.turnColor
        val newClock = game.clock.map(_.takeback).map { clk =>
          clk.updatePlayer(color): clkPlayer =>
            clkPlayer.setRemaining(game.clockHistory.flatMap(_(color).lastOption) | clkPlayer.limit)
        }
        val newGame = game
          .withChess(rewindedGame.copy(clock = newClock))
          .copy(
            players = game.players.map(_.removeTakebackProposition),
            binaryMoveTimes = game.binaryMoveTimes.map { binary =>
              val moveTimes = BinaryFormat.moveTime.read(binary, game.playedPlies)
              BinaryFormat.moveTime.write(moveTimes.dropRight(1))
            },
            loadClockHistory = _ => game.clockHistory.map(_.update(!color, _.dropRight(1))),
            movedAt = nowInstant,
            metadata = game.metadata.focus(_.drawOffers).modify(_.beforePly(rewindedGame.ply))
          )
        Progress(game, newGame)

  /** An accepted takeback of a Go game's last action (ADR 0019 §6): go-rules' `undo`, with the clock restored
    * from the clock history as for chess.
    */
  def go(game: CoreGame): Either[String, Progress] =
    for
      go <- game.go.toRight(s"${game.id} is not a Go game")
      undone <- go.undo.left.map(r => s"${game.id} takeback refused: ${r.key}")
    yield
      val undoneGame = game.withGo(undone)
      // as for chess above: `color` did not play the move taken back
      val color = game.turnColor
      val newClock = game.clock.map(_.takeback).map { clk =>
        clk.updatePlayer(color): clkPlayer =>
          clkPlayer.setRemaining(game.clockHistory.flatMap(_(color).lastOption) | clkPlayer.limit)
      }
      val newGame = undoneGame.copy(
        clock = newClock,
        players = game.players.map(_.removeTakebackProposition),
        binaryMoveTimes = game.binaryMoveTimes.map { binary =>
          val moveTimes = BinaryFormat.moveTime.read(binary, game.playedPlies)
          BinaryFormat.moveTime.write(moveTimes.dropRight(1))
        },
        loadClockHistory = _ => game.clockHistory.map(_.update(!color, _.dropRight(1))),
        movedAt = nowInstant
      )
      Progress(game, newGame)
