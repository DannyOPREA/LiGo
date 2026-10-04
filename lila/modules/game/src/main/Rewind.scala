package lila.game

object Rewind:

  /** An accepted takeback of a game's last action (ADR 0019 §6): go-rules' `undo`, with a Fischer clock
    * restored from the clock history. A byo-yomi clock only gives the turn back: the time and periods already
    * used stay used (unit 4.7), since main time and periods can't be rebuilt from one number per move.
    */
  def go(game: CoreGame): Either[String, Progress] =
    for undone <- game.go.undo.left.map(r => s"${game.id} takeback refused: ${r.key}")
    yield
      val undoneGame = game.withGo(undone)
      // `color` did not play the move taken back
      val color = game.turnColor
      val newClock = game.clock.map(_.takeback).map { clk =>
        clk.updatePlayer(color): clkPlayer =>
          clkPlayer.setRemaining(game.clockHistory.flatMap(_(color).lastOption) | clkPlayer.limit)
      }
      val newGame = undoneGame.copy(
        clock = newClock,
        byoyomi = game.byoyomi.map(_.takeback),
        players = game.players.map(_.removeTakebackProposition),
        binaryMoveTimes = game.binaryMoveTimes.map { binary =>
          val moveTimes = BinaryFormat.moveTime.read(binary, game.playedPlies)
          BinaryFormat.moveTime.write(moveTimes.dropRight(1))
        },
        loadClockHistory = _ => game.clockHistory.map(_.update(!color, _.dropRight(1))),
        movedAt = nowInstant
      )
      Progress(game, newGame)
