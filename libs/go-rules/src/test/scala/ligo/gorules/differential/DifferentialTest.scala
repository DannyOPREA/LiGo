package ligo.gorules.differential

import ligo.gorules.*

// The differential test's own plumbing, checked without KataGo (the nightly workflow runs the real thing):
// GTP parsing on real KataGo v1.18.1 output, and the game driver against oracles built from the adapter
// itself, one faithful and one with a planted bug.
// Licence: MIT (LiGo's own code, ADR 0006).
class DifferentialTest extends munit.FunSuite:

  override val munitTimeout = scala.concurrent.duration.Duration(3, "min")

  // KataGo v1.18.1 `showboard` after handicap C3 G7, then W b2, B e5, W d5, B a1, W f5, B a2, W e4, B a3,
  // W e6 (capturing e5). Digits mark the three latest moves.
  private val showboard =
    """MoveNum: 9 HASH: 26A8ADC62AA63979759CC0D027C3BB5D
      |   A B C D E F G H J
      | 9 . . . . . . . . .
      | 8 . . . . . . . . .
      | 7 . . . . . . X . .
      | 6 . . . . O3. . . .
      | 5 . . . O . O . . .
      | 4 . . . . O1. . . .
      | 3 X2. X . . . . . .
      | 2 X O . . . . . . .
      | 1 X . . . . . . . .
      |Next player: Black
      |Rules: {"friendlyPassOk":false,"hasButton":false,"ko":"SITUATIONAL","komi":0.5,"scoring":"AREA","suicide":false,"tax":"NONE","whiteHandicapBonus":"0"}
      |B stones captured: 1
      |W stones captured: 0""".stripMargin

  private def p(sgf: String) = Point.fromSgf(sgf).get

  test("reads KataGo's board, player to move and captures"):
    val pos = Gtp.position(showboard, BoardSize.Nine)
    val black = Set("gc", "ag", "cg", "ah", "ai").map(p)
    val white = Set("ed", "de", "fe", "ef", "bh").map(p)
    assertEquals(pos.stones.keySet, black ++ white)
    assert(black.forall(pos.stones(_) == Color.Black))
    assert(white.forall(pos.stones(_) == Color.White))
    assertEquals(pos.toMove, Color.Black)
    assertEquals(pos.captures, Captures(black = 0, white = 1), "White took one Black stone")

  test("reads the legal points from kata-raw-nn's policy, top row first"):
    val rows = (0 until 9).map: row =>
      (0 until 9)
        .map(col => if (col, row) == (2, 0) || (col, row) == (8, 8) then "NAN" else "0.000123")
        .mkString(" ")
    val rawNn = ("symmetry 0" :: "whiteWin 0.5" :: "policy" :: rows.toList ::: List("policyPass 0.000007"))
      .mkString("\n")
    val legal = Gtp.legalPoints(rawNn, BoardSize.Nine)
    assertEquals(legal.size, 79)
    assert(!legal(p("ca")) && !legal(p("ii")) && legal(p("aa")))

  test("writes GTP vertices without the letter I, counting rows from the bottom"):
    assertEquals(Gtp.vertex(p("aa"), BoardSize.Nineteen), "A19")
    assertEquals(Gtp.vertex(p("ii"), BoardSize.Nine), "J1")
    assertEquals(Gtp.vertex(p("pd"), BoardSize.Nineteen), "Q16")

  test("reads final_score as White minus Black"):
    assertEquals(Gtp.score("W+8.0"), 8.0)
    assertEquals(Gtp.score("B+3.5"), -3.5)
    assertEquals(Gtp.score("0"), 0.0)

  test("counts a finished board by area, komi to White"):
    // Black walls column d and owns a-d (36 points), White walls e and owns e-i (45); komi 7.
    val stones = (0 until 9).flatMap(r => List(Point(3, r) -> Color.Black, Point(4, r) -> Color.White)).toMap
    val g =
      GoGame.start(Setup(BoardSize.Nine, Ruleset.Chinese, 7, position = Some(Position(stones, Color.Black))))
    assertEquals(g.map(EngineScore.whiteMinusBlack), Right(45 + 7.0 - 36))

  test("random games agree with an oracle that follows the rules"):
    val all = (1L to 30L).map(seed => DifferentialGame.play(seed, AdapterOracle()))
    all.collect { case Left(d) => d }.foreach(d => fail(d.summary))
    val stats = all.collect { case Right(s) => s }
    assert(stats.forall(_.scored))
    assert(stats.map(_.stones).sum > 1500)
    assert(stats.exists(_.passes > 2) && stats.exists(_.undos > 0) && stats.exists(_.resumes > 0))
    assert(stats.exists(_.handicap > 0))
    assert(stats.map(_.suicideRefusals).sum > 0 && stats.map(_.koRefusals).sum > 0)

  test("the same seed plays the same game"):
    assertEquals(DifferentialGame.play(7, AdapterOracle()), DifferentialGame.play(7, AdapterOracle()))

  test("reports an oracle that misses captures"):
    val result = DifferentialGame.play(3, AdapterOracle(forgetCaptures = true))
    assert(result.left.exists(_.what.exists(_.startsWith("captures"))), result)

  test("reports an oracle that allows a ko retake"):
    val result =
      (1L to 30L).iterator.map(DifferentialGame.play(_, AdapterOracle(allowKo = true))).find(_.isLeft)
    assert(result.exists(_.left.exists(_.what.exists(_.startsWith("legal points")))), result)

/** An oracle that is the adapter itself (so it always agrees), optionally with a planted bug. */
private class AdapterOracle(forgetCaptures: Boolean = false, allowKo: Boolean = false) extends Oracle:
  private var game = GoGame.start(Setup(BoardSize.Nine, Ruleset.Chinese, 0)).toOption.get

  def newGame(size: BoardSize, komi: Double, handicapStones: Set[Point]): Unit =
    val stones = handicapStones.map(_ -> Color.Black).toMap
    val toMove = if stones.isEmpty then Color.Black else Color.White
    game =
      GoGame.start(Setup(size, Ruleset.Chinese, komi, position = Some(Position(stones, toMove)))).toOption.get

  // After two passes the adapter is in its scoring phase; KataGo simply plays on, and so does this oracle.
  private def inPlay: GoGame = if game.phase == Phase.Scoring then game.resume.toOption.get else game

  def play(color: Color, at: Option[Point]): Unit = game = at.fold(inPlay.pass)(inPlay.play).toOption.get

  def undo(): Unit = game = game.undo.toOption.get

  def legalPoints: Set[Point] =
    val legal = inPlay.legalPoints.toSet
    if allowKo then legal ++ game.koPoint.filterNot(game.stones.contains) else legal

  def position: OraclePosition =
    OraclePosition(game.stones, game.toMove, if forgetCaptures then Captures(0, 0) else game.captures)

  def finalScore: Double = EngineScore.whiteMinusBlack(game)
