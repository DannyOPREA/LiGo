package lila.game

import chess.variant.Standard
import chess.{ ByColor, Clock, Color, Game as ChessGame, Ply, Rated, Square }

import lila.core.game.{ Game, Player, Source, newGame }
import lila.core.id.GamePlayerId
import lila.game.GameExt.*

// Unit 3.11 (ADR 0019 §3): lila's Game keeps the ply, the starting ply and the clock itself, and the
// chess game it still carries until 3.17 gets them through `chessState`.
class GameStateTest extends munit.FunSuite:

  private def game: Game =
    newGame(
      ChessGame(
        position = Standard.initialPosition,
        clock = Clock(Clock.LimitSeconds(300), Clock.IncrementSeconds(3)).some
      ),
      ByColor(c => Player(GamePlayerId("abcd"), c, aiLevel = none)),
      rated = Rated.No,
      source = Source.Lobby,
      pgnImport = none
    ).sloppy

  private def move(g: Game, orig: Square, dest: Square): Game =
    val (next, m) = g.chessState(orig, dest).fold(e => fail(e.value), identity)
    g.applyMove(next, m).game

  test("a new game takes its ply, start and clock from the chess game"):
    val g = game
    assertEquals(g.ply, Ply.initial)
    assertEquals(g.startedAtPly, Ply.initial)
    assertEquals(g.clock.map(_.config.limitSeconds.value), Some(300))
    assertEquals(g.turnColor, Color.White)

  test("a move advances lila's ply and turn"):
    val g = move(move(game, Square.E2, Square.E4), Square.E7, Square.E5)
    assertEquals(g.ply, Ply(2))
    assertEquals(g.playedPlies, Ply(2))
    assertEquals(g.turnColor, Color.White)
    assertEquals(g.chessState.ply, g.ply)

  test("a clock change on lila's game reaches the chess rules"):
    val g = game.startClock.fold(fail("no clock"))(_.game)
    val moreTime = g.clock.map(_.giveTime(Color.White, chess.Centis(1500)))
    val g2 = g.withClock(moreTime.get).game
    assertEquals(g2.chessState.clock, g2.clock)
    assertNotEquals(g2.clock, g.clock)
    // the next move steps the clock lila holds, not a stale copy
    val after = move(g2, Square.E2, Square.E4)
    assertEquals(after.clock.map(_.config), g2.clock.map(_.config))
    assert(after.clock.exists(_.isRunning))
