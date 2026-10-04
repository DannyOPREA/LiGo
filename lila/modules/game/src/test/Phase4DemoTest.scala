package lila.game

import chess.{ ByColor, Color, MoveMetrics, Rated, Status }
import ligo.gorules.{ Action, BoardSize, ByoyomiConfig, CountVersion, Point, Ruleset, Setup as GoSetup }
import play.api.libs.json.*

import java.nio.charset.StandardCharsets.UTF_8
import java.nio.file.{ Files, Path, Paths }

import lila.core.game.{ Game, GoScoring, Player, Source, newGoGame }
import lila.core.id.GamePlayerId
import lila.game.GameExt.*
import lila.game.GoScoringPlay.*

/** Unit 4.12, the Phase 4 demo as a script: two 19×19 Japanese games with byo-yomi, played to the end through
  * the scoring phase as the round applies it. Every message lila sends the scoring service, every answer it
  * gets, and the final SGF are files in `libs/conformance/demo/phase-4/`. The scoring service's test
  * (`services/scoring/test/demo-phase4.test.ts`) answers the same requests and must give the same replies;
  * the board's test (`libs/board/test/sgf.test.mjs`) reads the SGFs back through goban-engine and must reach
  * the same final position. So the three parts are checked against each other, without a running site.
  *
  * `LIGO_DEMO_WRITE=1` writes the files that are missing instead of failing (run this test and the scoring
  * service's, in turn, until nothing is missing). A file that exists is always compared.
  */
class Phase4DemoTest extends munit.FunSuite:

  private val dir: Path =
    Iterator
      .iterate(Option(Paths.get("").toAbsolutePath))(_.flatMap(d => Option(d.getParent)))
      .takeWhile(_.isDefined)
      .flatten
      .map(_.resolve("libs/conformance/demo/phase-4"))
      .find(d => Files.isDirectory(d.getParent))
      .getOrElse(fail("libs/conformance/demo not found above the working directory"))

  private val writing = sys.env.get("LIGO_DEMO_WRITE").contains("1")

  private def golden(name: String, text: String): Unit =
    val file = dir.resolve(name)
    if Files.exists(file) then assertEquals(text, Files.readString(file, UTF_8), s"$name differs")
    else if writing then
      Files.createDirectories(dir)
      Files.writeString(file, text, UTF_8)
    else fail(s"$name is missing (LIGO_DEMO_WRITE=1 writes it)")

  private def goldenJson(name: String, js: JsValue): Unit = golden(name, Json.prettyPrint(js) + "\n")

  /** The service's answer to a request, as the scoring service's demo test wrote it. */
  private def answer(name: String): Reply.Counted =
    val file = dir.resolve(name)
    if !Files.exists(file) then
      if writing then fail(s"$name is missing: run the scoring service's demo test with LIGO_DEMO_WRITE=1")
      else fail(s"$name is missing")
    Reply.parse(Json.parse(Files.readString(file, UTF_8))) match
      case Some(c: Reply.Counted) => c
      case other => fail(s"$name is not a count: $other")

  private val t0 = java.time.Instant.parse("2026-10-04T12:00:00Z")
  private def at(seconds: Long) = t0.plusSeconds(seconds)

  // 10 minutes main time, then 5 periods of 30 seconds
  private val byoyomi = ByoyomiConfig(mainSeconds = 600, periods = 5, periodSeconds = 30)

  private def newGame(id: String): Game =
    newGoGame(
      GoSetup(BoardSize.Nineteen, Ruleset.Japanese, 6.5, 0),
      None,
      ByColor(c => Player(GamePlayerId(if c.white then "wwww" else "bbbb"), c, aiLevel = none)),
      rated = Rated.No,
      source = Source.Friend,
      byoyomi = Some(byoyomi)
    ).fold(e => fail(e.message), _.start.withId(GameId(id)))
      .copy(createdAt = t0)

  private def play(g: Game, token: String): Game =
    val action = if token == "pass" then Action.Pass else Action.Place(Point.fromSgf(token).get)
    val next = g.go(action).fold(r => fail(s"refused $token: ${r.key}"), identity)
    g.applyGoMove(next, g.stepGoClock(MoveMetrics(), gameActive = g.goClockActiveAfter(next)).map(_.value))
      .game

  private def playAll(g: Game, tokens: Seq[String]): Game = tokens.foldLeft(g)(play)

  // Black builds a wall down column j, White one down column k: Black owns the left side, White the right.
  private val walls: Seq[String] = ('a' to 's').flatMap(row => Seq(s"j$row", s"k$row"))

  extension [A](e: Either[String, A]) private def ok: A = e.fold(r => fail(s"refused: $r"), identity)

  /** Two passes open the phase; lila's request goes out and the service's proposal comes back. */
  private def scoringOpens(g: Game, name: String, now: java.time.Instant): Game =
    val step = open(g, now).getOrElse(fail("the phase didn't open"))
    assert(step.game.byoyomi.exists(!_.isRunning), "the clocks stop while the players count")
    goldenJson(s"$name.request.json", step.request.getOrElse(fail("no proposal asked for")))
    counted(step.game, answer(s"$name.reply.json"), now.plusSeconds(2)).ok.game

  private def bothAccept(g: Game): Step =
    val seen = g.goScoring.get.version(GoScoring.phaseOf(g.go))
    val step = accept(accept(g, Color.Black, seen).ok.game, Color.White, seen).ok
    assert(step.ending.isDefined, "both accepted, so the game ends")
    step

  private def finish(step: Step): Game =
    val ending = step.ending.get
    val status = ending match
      case Ending.Scored(_) => Status.VariantEnd
      case Ending.NoCount => Status.UnknownFinish
    step.game.finish(status, ending.winner)

  private val names = ByColor(white = "White (demo)", black = "Black (demo)")

  /** What the board's test checks after reading the SGF: the result, and the stones and prisoners at the end.
    */
  private def expected(g: Game): JsObject =
    def points(c: ligo.gorules.Color) =
      g.go.stones.collect { case (p, `c`) => p }.toList.sortBy(p => (p.row, p.col)).map(_.sgf)
    Json.obj(
      "result" -> JsonView.goResult(g),
      "stones" -> Json.obj(
        "black" -> points(ligo.gorules.Color.Black),
        "white" -> points(ligo.gorules.Color.White)
      ),
      "captures" -> Json.obj("black" -> g.go.captures.black, "white" -> g.go.captures.white)
    )

  private def record(g: Game, name: String): Unit =
    val sgf = SgfDump(g, names, s"LiGo demo ${g.id}").getOrElse(fail("the record didn't replay"))
    assert(sgf.contains("TM[600]OT[5x30 byo-yomi]"), sgf)
    golden(s"$name.sgf", sgf + "\n")
    goldenJson(s"$name.expect.json", expected(g))

  test("game 1: both players pass, accept the proposal, and the game ends with the count"):
    val played = playAll(newGame("demo0001"), walls ++ Seq("pass", "pass"))
    val proposed = scoringOpens(played, "game1-p1-proposal", at(0))
    assertEquals(proposed.goScoring.get.dead, Set.empty[Point])
    val over = finish(bothAccept(proposed))
    assertEquals(over.status, Status.VariantEnd)
    assertEquals(over.winnerColor, Some(Color.Black))
    assertEquals(JsonView.goResult(over), Some("B+12.5"))
    record(over, "game1")

  test("game 2: a dispute, a resume, the stone captured in play, and a second count accepted"):
    val dd = Point.fromSgf("dd").get
    val played = playAll(newGame("demo0002"), walls ++ Seq("cc", "dd", "pass", "pass"))
    val proposed = scoringOpens(played, "game2-p1-proposal", at(0))
    assertEquals(proposed.goScoring.get.dead, Set.empty[Point], "the service (without KataGo) marks nothing")
    // Black marks White's invading stone dead; the count changes and Black accepts it
    val toggled = toggle(proposed, dd, CountVersion(1, 1)).ok
    goldenJson("game2-p1-count2.request.json", toggled.request.getOrElse(fail("no recount asked for")))
    val recounted = counted(toggled.game, answer("game2-p1-count2.reply.json"), at(10)).ok.game
    assertEquals(recounted.goScoring.get.dead, Set(dd))
    val blackAccepted = accept(recounted, Color.Black, CountVersion(1, 2)).ok.game
    // White disagrees and resumes; Black, the opponent of the second passer, moves and captures it in play
    val resumed = resume(blackAccepted, at(20)).ok.game
    assertEquals(resumed.turnColor, Color.Black)
    assert(resumed.byoyomi.exists(_.isRunning), "the clocks run again")
    val settled = playAll(resumed, Seq("dc", "pass", "cd", "pass", "ed", "pass", "de", "pass", "pass"))
    assert(!settled.go.stones.contains(dd), "dd was captured")
    assertEquals(settled.go.captures.black, 1)
    val proposed2 = scoringOpens(settled, "game2-p2-proposal", at(60))
    assertEquals(GoScoring.phaseOf(proposed2.go), 2)
    val over = finish(bothAccept(proposed2))
    assertEquals(over.winnerColor, Some(Color.Black))
    assertEquals(JsonView.goResult(over), Some("B+8.5"))
    record(over, "game2")
