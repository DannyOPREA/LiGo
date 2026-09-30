package lila.core

import _root_.chess.{ Color, Ply }
import ligo.gorules.{ Action, BoardSize, Color as GoColor, GoGame, Komi, Point, Position, Ruleset, Setup }

import lila.core.game.GoBridge

// ADR 0019 §3: lila decides whose turn it is from ply parity (`Ply.turn`), counting from the ply the
// game started at. Check that it agrees with go-rules' own `toMove` for every handicap case and for a
// custom position, through a game of placements and passes.
class GoBridgeTest extends munit.FunSuite:

  private def start(setup: Setup): GoGame = GoGame.start(setup).fold(e => fail(e.message), identity)

  private def setup(handicap: Int) =
    Setup(BoardSize.Nine, Ruleset.Japanese, Komi.standard(Ruleset.Japanese, handicap), handicap)

  /** Plays up to `n` actions, a pass every seventh one, else the first legal point that isn't the ko, and
    * checks lila's turn after each.
    */
  private def followTurns(first: GoGame, n: Int): Unit =
    val startedAt = GoBridge.startedAtPly(first)
    (1 to n).foldLeft((first, startedAt)): (acc, i) =>
      val (g, ply) = acc
      assertEquals(ply.turn, GoBridge.color(g.toMove), s"after ${i - 1} actions")
      val action =
        if i % 7 == 0 then Action.Pass
        else g.legalPoints.headOption.fold(Action.Pass)(Action.Place(_))
      g(action) match
        case Right(next) if next.phase == ligo.gorules.Phase.Play => (next, ply.next)
        case Right(_) => (first, startedAt) // two passes open the scoring phase: start over
        case Left(refusal) => fail(s"$action refused: $refusal")
    ()

  test("even game and handicap 1: Black moves first, from ply 1"):
    List(0, 1).foreach: h =>
      val g = start(setup(h))
      assertEquals(g.toMove, GoColor.Black)
      assertEquals(GoBridge.startedAtPly(g), Ply(1))
      followTurns(g, 60)

  test("handicap 2 to 9: White moves first, from ply 0"):
    (2 to 9).foreach: h =>
      val g = start(setup(h))
      assertEquals(g.toMove, GoColor.White)
      assertEquals(GoBridge.startedAtPly(g), Ply(0))
      followTurns(g, 60)

  test("a custom position takes its player to move"):
    List(GoColor.Black, GoColor.White).foreach: toMove =>
      val stones = Map(Point(2, 2) -> GoColor.Black, Point(6, 6) -> GoColor.White)
      val g = start(
        Setup(BoardSize.Nine, Ruleset.Chinese, komi = 7.5, position = Some(Position(stones, toMove)))
      )
      assertEquals(GoBridge.color(g.toMove), GoBridge.startedAtPly(g).turn)
      followTurns(g, 40)

  test("colours convert both ways"):
    List(Color.White, Color.Black).foreach: c =>
      assertEquals(GoBridge.color(GoBridge.goColor(c)), c)
    assertEquals(GoBridge.color(GoColor.Black), Color.Black)

  test("a move token is an SGF point or pass, and nothing else"):
    assertEquals(GoBridge.actionOf("pd"), Some(Action.Place(Point(15, 3))))
    assertEquals(GoBridge.actionOf("pass"), Some(Action.Pass))
    assertEquals(GoBridge.actionOf("e2e4"), None)
    assertEquals(GoBridge.actionOf("zz"), None)
    assertEquals(GoBridge.actionOf(""), None)
    for a <- List(Action.Place(Point(0, 18)), Action.Pass) do
      assertEquals(GoBridge.actionOf(GoBridge.token(a)), Some(a))

  test("the compact board: rows from the top, b and w, runs of empty points as numbers"):
    val g = start(setup(0))
      .play(Point(0, 0))
      .toOption
      .get
      .play(Point(8, 0))
      .toOption
      .get
      .play(Point(4, 4))
      .toOption
      .get
    assertEquals(GoBridge.board(g), "b7w/9/9/9/4b4/9/9/9/9")
    assertEquals(GoBridge.board(start(setup(0))), List.fill(9)("9").mkString("/"))

  test("labels: columns skip I, rows count from the bottom"):
    assertEquals(GoBridge.label(Point(0, 0), 19), "A19")
    assertEquals(GoBridge.label(Point(3, 15), 19), "D4")
    assertEquals(GoBridge.label(Point(7, 8), 9), "H1")
    assertEquals(GoBridge.label(Point(8, 8), 9), "J1")
    assertEquals(GoBridge.label(Point(18, 18), 19), "T1")
    assertEquals(GoBridge.label(Action.Place(Point(2, 2)), 9), "C7")
    assertEquals(GoBridge.label(Action.Pass, 9), "pass")
