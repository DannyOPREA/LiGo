package ligo.gorules

// Licence: MIT (LiGo's own code, ADR 0006).
class SgfTest extends munit.FunSuite:

  private def start(s: Setup): GoGame = GoGame.start(s).fold(e => fail(e.message), identity)

  private def play(g: GoGame, tokens: String*): GoGame =
    tokens.foldLeft(g)((g, t) => Fixtures.applyToken(g, t).fold(r => fail(s"$t refused: ${r.key}"), identity))

  test("writes an even game with the settings, moves and passes"):
    val g =
      play(start(Setup(BoardSize.Nine, Ruleset.Japanese, 6.5)), "ee", "cc", "pass", "gg", "pass", "pass")
    assertEquals(
      Sgf.write(g),
      "(;GM[1]FF[4]CA[UTF-8]SZ[9]RU[Japanese]KM[6.5]\n;B[ee]\n;W[cc]\n;B[]\n;W[gg]\n;B[]\n;W[])"
    )

  test("writes handicap stones as setup stones, with White to play first"):
    val g = play(start(Setup(BoardSize.Nineteen, Ruleset.Chinese, 0.5, handicap = 2)), "dd")
    assertEquals(
      Sgf.write(g),
      "(;GM[1]FF[4]CA[UTF-8]SZ[19]RU[Chinese]KM[0.5]HA[2]AB[dp][pd]PL[W]\n;W[dd])"
    )

  test("writes a custom position and whole-number or negative komi"):
    val position = Position(Map(Point(0, 0) -> Color.Black, Point(1, 1) -> Color.White), Color.Black)
    val g = play(start(Setup(BoardSize.Nine, Ruleset.Chinese, -3, position = Some(position))), "ee")
    assertEquals(Sgf.write(g), "(;GM[1]FF[4]CA[UTF-8]SZ[9]RU[Chinese]KM[-3]AB[aa]AW[bb]PL[B]\n;B[ee])")

  test("a resumption leaves no node and the colours keep alternating; a takeback removes its move"):
    val g = play(
      start(Setup(BoardSize.Nine, Ruleset.Japanese, 6.5)),
      "ee",
      "pass",
      "pass",
      "resume",
      "cc",
      "dd",
      "undo"
    )
    assertEquals(Sgf.write(g), "(;GM[1]FF[4]CA[UTF-8]SZ[9]RU[Japanese]KM[6.5]\n;B[ee]\n;W[]\n;B[]\n;W[cc])")

  // The full read-back is unit 1.8's (goban-engine reads SGF; we write no parser). Here, a check on
  // our own output only: replaying each server fixture's written move nodes from its setup, colour by
  // colour, gives back the same position. SGF marks no resumption, so play resumes where a move
  // follows a scoring phase.
  test("replaying the written moves of every server fixture gives the same position"):
    val node = "(?m)^;([BW])\\[([a-s]{2})?\\]".r
    for
      f <- Fixtures.forServer
      ruleset <- f.rulesets
    do
      val fresh = start(Fixtures.setupOf(f, ruleset))
      val g = play(fresh, f.moves*)
      val replayed = node
        .findAllMatchIn(Sgf.write(g))
        .foldLeft(fresh): (game, m) =>
          val g = if game.phase == Phase.Scoring then
            game.resume.fold(r => fail(s"${f.id}: ${r.key}"), identity)
          else game
          assertEquals(
            if g.toMove == Color.Black then "B" else "W",
            m.group(1),
            s"${f.id}: colour of ${m.matched}"
          )
          play(g, Option(m.group(2)).getOrElse("pass"))
      assertEquals(replayed.stones, g.stones, f.id)
      assertEquals(replayed.toMove, g.toMove, f.id)
      assertEquals(replayed.captures, g.captures, f.id)

class SgfInfoTest extends munit.FunSuite:

  private val game = GoGame
    .start(Setup(BoardSize.Nineteen, Ruleset.Japanese, 6.5))
    .flatMap(_.play(Point.fromSgf("pd").get))
    .fold(e => fail(e.toString), identity)

  test("writes players, ranks, date, place, byo-yomi and the result after the settings"):
    val info = SgfInfo(
      black = Some("alice"),
      white = Some("bob"),
      blackRank = Some("5k"),
      whiteRank = Some("1d"),
      date = Some(java.time.LocalDate.of(2026, 9, 28)),
      place = Some("LiGo"),
      time = Some(SgfTime.Byoyomi(ByoyomiConfig(600, 5, 30))),
      result = Some(GameResult.fromTotals(BigDecimal(40), BigDecimal("43.5")))
    )
    assertEquals(
      Sgf.write(game, info),
      "(;GM[1]FF[4]CA[UTF-8]SZ[19]RU[Japanese]KM[6.5]PB[alice]BR[5k]PW[bob]WR[1d]DT[2026-09-28]PC[LiGo]" +
        "TM[600]OT[5x30 byo-yomi]RE[W+3.5]\n;B[pd])"
    )

  test("writes Fischer and correspondence time, and escapes ] and backslash in names"):
    val fischer = SgfInfo(black = Some("a]b\\c"), time = Some(SgfTime.Fischer(300, 10)))
    assert(Sgf.write(game, fischer).contains("PB[a\\]b\\\\c]TM[300]OT[10 fischer]"), Sgf.write(game, fischer))
    val corr =
      SgfInfo(time = Some(SgfTime.Correspondence(3)), result = Some(GameResult.Resigned(Color.Black)))
    assert(Sgf.write(game, corr).contains("KM[6.5]OT[3 days per move]RE[B+R]"), Sgf.write(game, corr))

  test("line breaks in names become spaces"):
    assert(Sgf.write(game, SgfInfo(white = Some("a\r\nb\nc"))).contains("PW[a b c]"))

  test("without info the record is unchanged"):
    assertEquals(Sgf.write(game), Sgf.write(game, SgfInfo()))
