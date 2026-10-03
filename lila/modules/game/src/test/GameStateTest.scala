package lila.game

import chess.{ ByColor, Clock, Color, MoveMetrics, Ply, Rated }
import ligo.gorules.{ Action, Point }

import lila.core.game.{ Game, GoSetups, Player, Source, newGoGame }
import lila.core.id.GamePlayerId
import lila.game.GameExt.*

// Unit 3.11 (ADR 0019 §3): lila's Game keeps the ply, the starting ply and the clock itself. Since unit 3.17
// the Go game is the only rules state it carries.
class GameStateTest extends munit.FunSuite:

  private def game: Game =
    newGoGame(
      GoSetups.default,
      Clock(Clock.LimitSeconds(300), Clock.IncrementSeconds(3)).some,
      ByColor(c => Player(GamePlayerId("abcd"), c, aiLevel = none)),
      rated = Rated.No,
      source = Source.Lobby
    ).fold(e => fail(e.message), _.sloppy)

  private def move(g: Game, sgf: String): Game =
    val next = g.go(Action.Place(Point.fromSgf(sgf).get)).fold(r => fail(r.key), identity)
    g.applyGoMove(next, g.stepGoClock(MoveMetrics(), gameActive = true).map(_.value)).game

  test("a new game takes its ply, start and clock from the Go setup"):
    val g = game
    assertEquals(g.ply, Ply.initial.next)
    assertEquals(g.startedAtPly, Ply.initial.next)
    assertEquals(g.clock.map(_.config.limitSeconds.value), Some(300))
    assertEquals(g.turnColor, Color.Black)

  test("a move advances lila's ply and turn"):
    val g = move(move(game, "dd"), "pp")
    assertEquals(g.playedPlies, Ply(2))
    assertEquals(g.ply, g.startedAtPly + 2)
    assertEquals(g.turnColor, Color.Black)

  test("a clock change on lila's game is the clock the next move steps"):
    val g = game.startClock.fold(fail("no clock"))(_.game)
    val moreTime = g.clock.map(_.giveTime(Color.Black, chess.Centis(1500)))
    val g2 = g.withClock(moreTime.get).game
    assertNotEquals(g2.clock, g.clock)
    val after = move(g2, "dd")
    // 300 s + 15 s given (+ 3 s increment); a stale clock would leave Black at most 303 s
    assert(after.clock.exists(_.remainingTime(Color.Black) > chess.Centis(31000)))
    assert(after.clock.exists(_.isRunning))
