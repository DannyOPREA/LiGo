package lila.game

import chess.{ Color, Status }
import ligo.gorules.{ BoardSize, GoGame, Ruleset, Setup as GoSetup, SgfResult }

import lila.core.game.{ Game, GoBridge, Source }
import lila.game.importer.Importer

// Unit 7.5 (ADR 0023 §2): an SGF record stored as a finished Go game, and every way it is refused.
class ImporterTest extends munit.FunSuite:

  import BSONHandlers.gameHandler

  private val alice = UserId("alice")

  private def imported(sgf: String, user: Option[UserId] = none): Game =
    Importer.parse(sgf, user).fold(e => fail(s"refused: $e"), identity)

  private def refused(sgf: String, cap: Int = 1000): String =
    Importer.parse(sgf, none, cap).fold(identity, g => fail(s"stored ${g.go}"))

  private val nine =
    """(;GM[1]FF[4]CA[UTF-8]SZ[9]RU[Japanese]KM[6.5]PB[Black Bob]PW[White Wendy]BR[3k]WR[1d]DT[2026-10-04]RE[W+3.5]
      |;B[ee];W[cc];B[gc];W[ce];B[])""".stripMargin

  test("a 9x9 game: moves replayed, finished, not playable, with its text, names and date"):
    val g = imported(nine, alice.some)
    assertEquals(g.go.size, BoardSize.Nine)
    assertEquals(g.go.actions.size, 5)
    assertEquals(g.playedPlies.value, 5)
    assert(g.finished && !g.playable && g.isSgfImport && g.sourceIs(_.Import))
    assertEquals(g.sgfImport.map(_.sgf), Some(nine))
    assertEquals(g.sgfImport.flatMap(_.user), Some(alice))
    assertEquals(g.sgfImport.flatMap(_.date), Some("2026-10-04"))
    assertEquals(g.sgfImport.flatMap(_.h).map(_.length), Some(12))
    assertEquals(g.whitePlayer.name.map(_.value), Some("White Wendy (1d)"))
    assertEquals(g.blackPlayer.name.map(_.value), Some("Black Bob (3k)"))
    // ranks are text, never ratings; the game is casual and belongs to nobody's rating
    assert(g.players.forall(p => p.rating.isEmpty && p.userId.isEmpty))
    assert(g.rated.no)
    assertEquals((g.status, g.winnerColor), (Status.VariantEnd, Some(Color.White)))

  test("a 19x19 game with a variation and a comment stores its main line"):
    val g = imported(
      "(;GM[1]FF[4]SZ[19]KM[6.5]C[root note](;B[pd];W[dd]C[a note](;B[pq])(;B[dp]))(;B[dd]))",
      none
    )
    assertEquals(g.go.size, BoardSize.Nineteen)
    assertEquals(g.go.actions.size, 3)
    assertEquals(GoBridge.token(g.go.actions.last), "pq")
    // the variation and the comments stay in the text the analysis board reads
    assert(g.sgfImport.exists(_.sgf.contains("C[root note]")))
    assert(g.sgfImport.exists(_.sgf.contains("(;B[dp])")))
    // no result in the file: finished with no result
    assertEquals((g.status, g.winnerColor), (Status.UnknownFinish, None))

  test("a 13x13 file is refused for the stored game, with the analysis board named"):
    assertEquals(
      refused("(;GM[1]FF[4]SZ[13];B[dd];W[jj])"),
      "13×13 games can be studied on the analysis board but not imported yet"
    )

  test("a bad move is refused with its number"):
    // move 3 plays on the point move 1 took
    assertEquals(
      refused("(;GM[1]FF[4]SZ[9];B[ee];W[cc];B[ee])"),
      "move 3: B[ee] is not a legal move (occupied)"
    )

  test("a move by the wrong colour is refused, not turned into an edit"):
    assertEquals(
      refused("(;GM[1]FF[4]SZ[9];B[ee];B[cc])"),
      "move 2: B[cc] is not a move by white, the player to move"
    )

  test("a point off the board is refused with its number"):
    assert(refused("(;GM[1]FF[4]SZ[9];B[ee];W[tt2])").startsWith("move 2: "))
    assert(refused("(;GM[1]FF[4]SZ[9];B[ee];W[jj])").startsWith("move 2: W[jj] is off the board"))

  test("a game longer than the cap is refused, naming the cap"):
    // passes alternate with stones so two passes never end play (the cap is the test's, three actions)
    val msg = refused("(;GM[1]FF[4]SZ[9];B[aa];W[bb];B[cc];W[dd])", cap = 3)
    assertEquals(msg, "move 4: the game is longer than 3 moves")

  test("a game that plays on after two passes in a row can't be stored"):
    assertEquals(
      refused("(;GM[1]FF[4]SZ[9];B[];W[];B[ee])"),
      "move 3: a move after two passes in a row: a resumed game can't be imported"
    )

  test("text over 200 KB is refused before it is read"):
    val big = "(;GM[1]FF[4]SZ[9]C[" + ("x" * (200 * 1024)) + "];B[ee])"
    assert(Importer.checkSize(big).isLeft)
    assert(Importer.checkSize(nine).isRight)
    assert(Importer.parse(big, none).isLeft)
    // bytes count, not characters: 70,000 three-byte characters are over the limit
    assert(Importer.checkSize("é" * 110000).isLeft)

  test("not an SGF, an unreadable one and another game are refused"):
    assert(refused("hello").nonEmpty)
    assert(
      refused("(;GM[1]FF[4]SZ[9];B[ee]").nonEmpty || Importer.parse("(;GM[1]FF[4]SZ[9];B[ee]", none).isRight
    )
    assert(refused("(;GM[2]FF[4];B[ee])").contains("not a game of Go"))

  test("the same file twice has one hash; spaces and blank lines don't matter, other notes do"):
    val h = (s: String) => SgfImport.hash(s).toList
    assertEquals(h(nine), h(nine))
    assertEquals(h(nine), h(nine.replace("\n", "\n\n  \r\n").replace(" ", "  ")))
    assertNotEquals(h(nine), h(nine.replace("PB[Black Bob]", "PB[Someone Else]")))
    // same moves, other settings: another game
    assertNotEquals(h("(;GM[1]SZ[9]KM[6.5];B[ee])"), h("(;GM[1]SZ[9]KM[0.5];B[ee])"))

  private def setupOf(sgf: String): GoSetup = imported(sgf).go.setup

  test("RU, KM and HA: rulesets, komi in stones, handicap on the fixed points"):
    assertEquals(setupOf("(;GM[1]SZ[9];B[ee])").ruleset, Ruleset.Japanese)
    assertEquals(setupOf("(;GM[1]SZ[9]RU[Korean];B[ee])").ruleset, Ruleset.Japanese)
    assertEquals(setupOf("(;GM[1]SZ[9]RU[Chinese];B[ee])").ruleset, Ruleset.Chinese)
    assertEquals(setupOf("(;GM[1]SZ[9]RU[AGA];B[ee])").ruleset, Ruleset.Chinese)
    // an unknown ruleset is Japanese, noted by the game's import info
    assertEquals(setupOf("(;GM[1]SZ[9]RU[Foo];B[ee])").ruleset, Ruleset.Japanese)
    assertEquals(setupOf("(;GM[1]SZ[19]KM[6.5];B[pd])").komi, 6.5)
    // komi in stones from a Chinese server: 3.75 is 7.5; a Japanese file keeps 3.75's refusal
    assertEquals(setupOf("(;GM[1]SZ[19]RU[Chinese]KM[3.75];B[pd])").komi, 7.5)
    assertEquals(setupOf("(;GM[1]SZ[19]RU[Chinese]KM[7.5];B[pd])").komi, 7.5)
    assert(refused("(;GM[1]SZ[19]RU[Japanese]KM[3.75];B[pd])").contains("multiple of 0.5"))
    assert(refused("(;GM[1]SZ[19]KM[abc];B[pd])").contains("KM[abc]"))

  test("handicap: HA with AB on the fixed points is a handicap game, other stones a custom start"):
    val points = GoGame
      .start(GoSetup(BoardSize.Nine, Ruleset.Japanese, 0.5, 2))
      .fold(e => fail(e.message), _.stones.keys.map(_.sgf).toList.sorted)
    val ab = points.map(p => s"[$p]").mkString
    val h2 = imported(s"(;GM[1]SZ[9]KM[0.5]HA[2]AB$ab;W[ee])")
    assertEquals(h2.go.setup.handicap, 2)
    assert(h2.go.setup.position.isEmpty)
    assertEquals(h2.startedAtPly.value, 0)
    assertEquals(h2.turnColor, Color.Black)
    // setup stones that aren't the fixed points: a custom start, no handicap
    val custom = imported("(;GM[1]SZ[9]HA[2]AB[aa][bb];W[ee])")
    assertEquals(custom.go.setup.handicap, 0)
    assert(custom.go.setup.position.isDefined)
    // HA[1] is no stone and Black first
    assertEquals(setupOf("(;GM[1]SZ[9]HA[1];B[ee])").handicap, 1)
    assert(refused("(;GM[1]SZ[9]HA[12];B[ee])").contains("HA[12]"))

  test("RE: the result the file states, as lila's statuses"):
    import SgfResult.*
    import ligo.gorules.Color as G
    def end(re: String) = Importer.ending(Some(SgfResult(re)))
    assertEquals(end("B+3.5"), (Status.VariantEnd, Some(Color.Black)))
    assertEquals(end("W+0.5"), (Status.VariantEnd, Some(Color.White)))
    assertEquals(end("B+"), (Status.VariantEnd, Some(Color.Black)))
    assertEquals(end("B+R"), (Status.Resign, Some(Color.Black)))
    assertEquals(end("W+Resign"), (Status.Resign, Some(Color.White)))
    assertEquals(end("B+T"), (Status.Outoftime, Some(Color.Black)))
    assertEquals(end("W+F"), (Status.Timeout, Some(Color.White)))
    assertEquals(end("0"), (Status.VariantEnd, None))
    assertEquals(end("Jigo"), (Status.VariantEnd, None))
    assertEquals(end("Void"), (Status.UnknownFinish, None))
    assertEquals(end("B+abc"), (Status.UnknownFinish, None))
    assertEquals(end("nonsense"), (Status.UnknownFinish, None))
    assertEquals(Importer.ending(None), (Status.UnknownFinish, None))
    assertEquals(SgfResult("B+3.5"), Points(G.Black, BigDecimal("3.5")))

  test("a resignation in the file is the game's status and winner"):
    val g = imported("(;GM[1]SZ[9]RE[B+R];B[ee];W[cc])")
    assertEquals((g.status, g.winnerColor), (Status.Resign, Some(Color.Black)))
    assert(g.blackPlayer.isWinner.contains(true))

  test("names from the file are cut and cleaned, a rank alone is kept as text"):
    val long = "x" * 200
    val g = imported(s"(;GM[1]SZ[9]PB[$long]WR[9p];B[ee])")
    assertEquals(g.blackPlayer.name.map(_.value.length), Some(60))
    assertEquals(g.whitePlayer.name.map(_.value), Some("? (9p)"))
    val none = imported("(;GM[1]SZ[9];B[ee])")
    assertEquals(none.blackPlayer.name.map(_.value), Some("?"))

  test("the stored game round-trips through Mongo with its sgfi block, and loads as an import"):
    val g = imported(nine, alice.some)
    val back = gameHandler.read(gameHandler.write(g))
    assertEquals(back.sgfImport.map(_.sgf), Some(nine))
    assertEquals(back.sgfImport.flatMap(_.user), Some(alice))
    assertEquals(back.sgfImport.flatMap(_.date), Some("2026-10-04"))
    assertEquals(back.sgfImport.flatMap(_.h).map(_.toList), g.sgfImport.flatMap(_.h).map(_.toList))
    assertEquals(back.go.actions, g.go.actions)
    assertEquals(back.source, Some(Source.Import))
    val doc = gameHandler.write(g)
    assert(doc.contains("sgfi") && !doc.contains("pgni"))

  test("the game's result for the page comes from RE, as written"):
    assertEquals(JsonView.goResult(imported(nine)), Some("W+3.5"))
    assertEquals(JsonView.goResult(imported("(;GM[1]SZ[9]RE[B+10.0];B[ee])")), Some("B+10"))
    assertEquals(JsonView.goResult(imported("(;GM[1]SZ[9]RE[0];B[ee])")), Some("0"))
    assertEquals(JsonView.goResult(imported("(;GM[1]SZ[9]RE[B+R];B[ee])")), None)
    assertEquals(JsonView.goResult(imported("(;GM[1]SZ[9];B[ee])")), None)
