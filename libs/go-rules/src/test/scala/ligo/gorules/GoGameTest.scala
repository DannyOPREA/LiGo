package ligo.gorules

// What the adapter does beyond the conformance fixtures: setup checks, komi, takeback limits.
// Licence: MIT (LiGo's own code, ADR 0006).
class GoGameTest extends munit.FunSuite:

  private def setup(size: BoardSize = BoardSize.Nine, handicap: Int = 0, komi: Double = 6.5) =
    Setup(size, Ruleset.Japanese, komi, handicap)

  private def start(s: Setup): GoGame = GoGame.start(s).fold(e => fail(e.message), identity)

  extension (e: Either[Refusal, GoGame])
    private def ok: GoGame = e.fold(r => fail(s"refused: ${r.key}"), identity)

  private def p(sgf: String) = Point.fromSgf(sgf).get

  test("an even game starts empty with Black to move"):
    val g = start(setup())
    assertEquals(g.stones, Map.empty)
    assertEquals(g.toMove, Color.Black)
    assertEquals(g.phase, Phase.Play)

  test("a 1-stone handicap places no stone and Black moves first (R-HCP-2)"):
    val g = start(setup(handicap = 1, komi = 0.5))
    assertEquals(g.stones, Map.empty)
    assertEquals(g.toMove, Color.Black)

  test("handicap stones go on the R-HCP-4 points and White moves first, on 19x19 too"):
    val g = start(setup(size = BoardSize.Nineteen, handicap = 6, komi = 0.5))
    assertEquals(g.stones.keySet.map(_.sgf), Set("pd", "dp", "pp", "dd", "dj", "pj"))
    assert(g.stones.values.forall(_ == Color.Black))
    assertEquals(g.toMove, Color.White)

  test("refuses more than 9 handicap stones or a negative handicap"):
    assertEquals(GoGame.start(setup(handicap = 10)), Left(SetupError.HandicapOutOfRange(10)))
    assertEquals(GoGame.start(setup(handicap = -1)), Left(SetupError.HandicapOutOfRange(-1)))

  test("refuses handicap stones on top of a custom position"):
    val s = setup(handicap = 2).copy(position = Some(Position(Map.empty, Color.Black)))
    assertEquals(GoGame.start(s), Left(SetupError.HandicapWithPosition))

  test("refuses komi that is not a multiple of 0.5 or is bigger than the board (R-KOMI-4)"):
    assertEquals(GoGame.start(setup(komi = 6.25)), Left(SetupError.BadKomi(6.25)))
    assertEquals(GoGame.start(setup(komi = -81.5)), Left(SetupError.BadKomi(-81.5)))
    assert(GoGame.start(setup(komi = -81)).isRight)
    assert(GoGame.start(setup(komi = 0)).isRight)

  test("refuses a starting position with a stone off the board or a chain without liberties"):
    val off = setup().copy(position = Some(Position(Map(Point(9, 0) -> Color.Black), Color.Black)))
    assertEquals(GoGame.start(off), Left(SetupError.StoneOffBoard(Point(9, 0))))
    val dead = Map(p("aa") -> Color.Black, p("ba") -> Color.White, p("ab") -> Color.White)
    val noLiberty = setup().copy(position = Some(Position(dead, Color.Black)))
    assertEquals(GoGame.start(noLiberty), Left(SetupError.StonesWithoutLiberty(p("aa"))))

  test("standard komi: 6.5 Japanese, 7.5 Chinese, 0.5 with any handicap (R-KOMI-1, R-KOMI-2)"):
    assertEquals(Komi.standard(Ruleset.Japanese, 0), 6.5)
    assertEquals(Komi.standard(Ruleset.Chinese, 0), 7.5)
    assertEquals(Komi.standard(Ruleset.Japanese, 1), 0.5)
    assertEquals(Komi.standard(Ruleset.Chinese, 9), 0.5)

  test("refuses a stone off the board"):
    assertEquals(start(setup()).play(Point(9, 4)), Left(Refusal.OffBoard))

  test("nothing to take back at the start"):
    assertEquals(start(setup()).undo, Left(Refusal.NothingToUndo))

  test("no takeback during the scoring phase (R-KO-8)"):
    val scoring = start(setup()).pass.ok.pass.ok
    assertEquals(scoring.phase, Phase.Scoring)
    assertEquals(scoring.undo, Left(Refusal.InScoring))

  test("a takeback never reaches back past a resumption"):
    val resumed = start(setup()).play(p("ee")).ok.pass.ok.pass.ok.resume.ok
    assertEquals(resumed.undo, Left(Refusal.NothingToUndo))
    val afterMove = resumed.play(p("cc")).ok
    assertEquals(afterMove.undo.ok.actions, resumed.actions)

  test("a takeback restores the position, the turn and the captures"):
    val before = start(setup()).play(p("ba")).ok.play(p("aa")).ok
    val captured = before.play(p("ab")).ok
    assertEquals(captured.captures, Captures(black = 1, white = 0))
    val undone = captured.undo.ok
    assertEquals(undone.stones, before.stones)
    assertEquals(undone.toMove, Color.Black)
    assertEquals(undone.captures, Captures(0, 0))

  test("legal points are exactly the points where play succeeds"):
    val g = start(setup()).play(p("ee")).ok.play(p("de")).ok.play(p("dd")).ok
    val all = for c <- 0 until 9; r <- 0 until 9 yield Point(c, r)
    assertEquals(g.legalPoints.toSet, all.filter(g.play(_).isRight).toSet)

  test("no legal points during the scoring phase"):
    assertEquals(start(setup()).pass.ok.pass.ok.legalPoints, Nil)

  test("13x13: corners map to SGF points and 4 handicap stones go on the 4-4 points"):
    val g = start(setup(size = BoardSize.Thirteen, handicap = 4, komi = 0.5))
    assertEquals(g.stones.keySet.map(_.sgf), Set("dd", "jd", "dj", "jj"))
    val corners = start(setup(size = BoardSize.Thirteen)).play(p("aa")).ok.play(p("mm")).ok
    assertEquals(corners.stones, Map(p("aa") -> Color.Black, p("mm") -> Color.White))
    assertEquals(corners.play(Point(13, 0)), Left(Refusal.OffBoard))
