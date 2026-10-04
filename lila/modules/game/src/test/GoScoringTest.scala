package lila.game

import chess.{ ByColor, Clock, Color, MoveMetrics, Rated }
import ligo.gorules.{ Action, BoardSize, CountVersion, GameResult, Point, Ruleset, Setup as GoSetup }
import play.api.libs.json.*
import reactivemongo.api.bson.*
import scalalib.model.Days

import lila.core.game.{ Game, GoScoring, Player, Source, newGoGame }
import lila.core.id.GamePlayerId
import lila.game.GameExt.*
import lila.game.GoScoringPlay.*

// Unit 4.8 (ADR 0020 §1–6): a Go game's scoring phase, step by step, as the round applies it.
class GoScoringTest extends munit.FunSuite:

  import BSONHandlers.gameHandler

  private val t0 = java.time.Instant.parse("2026-10-04T12:00:00Z")
  private def at(seconds: Long) = t0.plusSeconds(seconds)

  private def p(sgf: String) = Point.fromSgf(sgf).get

  private def newGo(
      clock: Option[Clock] = None,
      days: Option[Days] = None,
      ruleset: Ruleset = Ruleset.Japanese
  ) =
    newGoGame(
      GoSetup(BoardSize.Nine, ruleset, 6.5, 0),
      clock,
      ByColor(c => Player(GamePlayerId(if c.white then "wwww" else "bbbb"), c, aiLevel = none)),
      rated = Rated.No,
      source = Source.Lobby,
      daysPerTurn = days
    ).fold(e => fail(e.message), _.start.sloppy)

  private def play(g: Game, action: Action): Game =
    val next = g.go.get(action).fold(r => fail(s"refused $action: ${r.key}"), identity)
    g.applyGoMove(next, g.stepGoClock(MoveMetrics(), gameActive = g.goClockActiveAfter(next)).map(_.value))
      .game

  private def playAll(g: Game, tokens: String*): Game =
    tokens.foldLeft(g): (g, t) =>
      play(g, if t == "pass" then Action.Pass else Action.Place(p(t)))

  private val fischer = Clock(Clock.LimitSeconds(300), Clock.IncrementSeconds(5))

  // Black: a two-stone chain at aa-ba; White: ee alone and a two-stone chain at gg-gh. White passes second.
  private def ended(g: Game = newGo(Some(fischer))) =
    playAll(g, "aa", "ee", "ba", "gg", "pass", "gh", "pass", "pass")

  extension [A](e: Either[String, A]) private def ok: A = e.fold(r => fail(s"refused: $r"), identity)

  private def opened(g: Game = ended(), now: java.time.Instant = t0): Step =
    open(g, now).getOrElse(fail("the phase didn't open"))

  private val count = GoScoring.Count(
    GoScoring.Side(territory = 10, stones = 0, prisoners = 2, komi = 0, compensation = 0, total = 12),
    GoScoring.Side(territory = 5, stones = 0, prisoners = 0, komi = 6.5, compensation = 0, total = 11.5)
  )

  private def reply(
      g: Game,
      request: Int,
      dead: Set[Point],
      proposal: Boolean = true,
      phase: Int = 1,
      c: GoScoring.Count = count
  ): Reply.Counted =
    Reply.Counted(
      Ref(g.id, phase, request),
      Option.when(proposal)(GoScoring.Source.KataGo),
      dead,
      Set(p("ef")),
      "b" * 81,
      c
    )

  private val geDead = Set(p("ee"))
  private def proposed(now: java.time.Instant = at(10)): Game =
    val g = opened().game
    counted(g, reply(g, 1, geDead), now).ok.game

  private def v(request: Int, phase: Int = 1) = CountVersion(phase, request)

  private def scoringEvent(step: Step): JsObject =
    step.progress.events
      .collectFirst { case e: Event.GoScoring => e.data.as[JsObject] }
      .getOrElse(fail("no event"))

  test("two passes open the phase: clocks stop, the proposal is asked for, and players see Counting…"):
    // the second pass already leaves a Fischer clock stopped; opening stops one still running anyway
    val g = ended().pipe(g => g.copy(clock = g.clock.map(_.start)))
    assert(g.clock.exists(_.isRunning))
    val step = opened(g)
    val sc = step.game.goScoring.getOrElse(fail("no sc"))
    assert(step.game.inGoScoring)
    assert(!step.game.clock.exists(_.isRunning), "clocks stop")
    assertEquals(sc.expiresAt, at(600), "lila waits 10 minutes for the proposal")
    assert(sc.outstanding)
    val req = step.request.getOrElse(fail("no request"))
    assertEquals((req \ "t").as[String], "propose")
    assertEquals((req \ "ref").as[String], s"${g.id}:1:1")
    assertEquals((req \ "rules").as[String], "j")
    assertEquals((req \ "size").as[Int], 9)
    assertEquals((req \ "komi").as[Double], 6.5)
    assertEquals((req \ "handicap").as[Int], 0)
    assertEquals((req \ "toMove").as[String], "b")
    assertEquals((req \ "board").as[String], lila.core.game.GoBridge.board(g.go.get))
    assertEquals((req \ "prisoners").as[JsObject], Json.obj("b" -> 0, "w" -> 0))
    assertEquals(scoringEvent(step) \ "counting", JsDefined(JsBoolean(true)))
    assertEquals(GoScoringPlay.request(step.game), Some(req), "the same request is re-sent until answered")
    assertEquals(open(step.game, t0), None, "it opens once")

  test("nobody runs out of time while the players agree on dead stones"):
    // a byo-yomi clock on a hand-moved wall clock, so time used is exact
    var ms = 1_000_000L
    val config = ligo.gorules.ByoyomiConfig(mainSeconds = 60, periods = 3, periodSeconds = 30)
    val g0 =
      newGo().copy(byoyomi = ligo.gorules.ByoyomiClock(config, ligo.gorules.Color.Black, () => ms).toOption)
    val g1 = playAll(g0, "aa", "ee", "ba")
    ms += 10_000
    val g = opened(playAll(g1, "gg", "pass", "gh", "pass", "pass")).game
    assert(!g.byoyomi.exists(_.isRunning), "the byo-yomi clock stops too")
    assert(g.byoyomi.exists(_.anyTimeUsed))
    assert(!g.outoftime(withGrace = false))
    assert(!g.outoftime(withGrace = true))
    // a stopped clock with time used reads as flagged outside the phase (lila's rule): the guard keeps it in play
    assert(g.copy(goScoring = None).outoftime(withGrace = false))
    // resuming restarts it for the player to move, with the time they had
    val r = resume(g, at(30)).ok.game
    assert(r.byoyomi.exists(_.isRunning))
    assertEquals(r.byoyomi.map(_.toMove), Some(ligo.gorules.Color.Black))

  test("the proposal shows the dead stones and count, and starts the 3-minute timeout"):
    val g = opened().game
    val step = counted(g, reply(g, 1, geDead), at(10)).ok
    val sc = step.game.goScoring.get
    assertEquals(sc.dead, geDead)
    assertEquals(sc.proposal, Some(GoScoring.Proposal(geDead, GoScoring.Source.KataGo)))
    assertEquals(sc.version(1), v(1))
    assertEquals(sc.expiresAt, at(190))
    assertEquals(sc.count, Some(count))
    assert(!sc.outstanding)
    assertEquals(GoScoringPlay.request(step.game), None)
    val js = scoringEvent(step)
    assertEquals((js \ "v").as[String], "1:1")
    assertEquals((js \ "src").as[String], "katago")
    assertEquals((js \ "dead").as[List[String]], List("ee"))
    assertEquals((js \ "seal").as[List[String]], List("ef"))
    assertEquals((js \ "score" \ "w" \ "komi").as[Double], 6.5)
    assertEquals((js \ "score" \ "b" \ "total").as[Double], 12d)
    assertEquals((js \ "accepted").as[JsObject], Json.obj("b" -> false, "w" -> false))
    assertEquals((js \ "pending").as[Boolean], false)

  test("a late, stale, partial or second proposal is refused and changes nothing"):
    val g = opened().game
    assert(counted(g, reply(g, 2, geDead), t0).isLeft, "not the latest request")
    assert(counted(g, reply(g, 1, geDead, phase = 2), t0).isLeft, "another phase")
    assert(counted(g, reply(g, 1, Set(p("gg"))), t0).isLeft, "half a chain")
    assert(counted(g, reply(g, 1, geDead, proposal = false), t0).isLeft, "a recount before the proposal")
    assert(
      counted(g, reply(g, 1, geDead).copy(owner = "b" * 80), t0).isLeft,
      "an owner string of the wrong size"
    )
    assert(
      counted(g, reply(g, 1, geDead).copy(seal = Set(p("pd"))), t0).isLeft,
      "a point to seal off a 9×9 board"
    )
    val g2 = proposed()
    assert(counted(g2, reply(g2, 1, geDead), t0).isLeft, "a second proposal")

  test("a toggle flips the whole chain, clears acceptances and asks for a recount of the new marks"):
    val g1 = accept(proposed(), Color.White, v(1)).ok.game
    assertEquals(g1.goScoring.get.accepted, Set(ligo.gorules.Color.White))
    val step = toggle(g1, p("gh"), v(1)).ok
    val sc = step.game.goScoring.get
    assertEquals(sc.dead, geDead ++ Set(p("gg"), p("gh")))
    assertEquals(sc.accepted, Set.empty)
    assert(sc.pending)
    val req = step.request.getOrElse(fail("no recount asked"))
    assertEquals((req \ "t").as[String], "count")
    assertEquals((req \ "ref").as[String], s"${g1.id}:1:2")
    assertEquals((req \ "dead").as[List[String]], List("ee", "gg", "gh"))
    assertEquals((scoringEvent(step) \ "pending").as[Boolean], true)
    // nothing more until the recount arrives
    assert(toggle(step.game, p("aa"), v(1)).isLeft)
    assert(accept(step.game, Color.Black, v(1)).isLeft)
    val recounted = counted(step.game, reply(step.game, 2, sc.dead, proposal = false), at(20)).ok.game
    assertEquals(recounted.goScoring.get.version(1), v(2))
    assertEquals(recounted.goScoring.get.expiresAt, at(190), "toggles don't restart the timeout")
    assert(accept(recounted, Color.Black, v(1)).isLeft, "an accept must name the count on show")

  test("toggles need a stone and the current count"):
    val g = proposed()
    assert(toggle(g, p("cc"), v(1)).isLeft)
    assert(toggle(g, p("aa"), v(2)).isLeft)
    assert(toggle(opened().game, p("aa"), v(0)).isLeft, "nothing to toggle before the proposal")

  test("both players accepting ends the game with the count: Black wins by 0.5"):
    val g = accept(proposed(), Color.Black, v(1)).ok.game
    val step = accept(g, Color.White, v(1)).ok
    assertEquals(step.ending, Some(Ending.Scored(GameResult.Scored(12, 11.5))))
    assertEquals(step.ending.flatMap(_.winner), Some(Color.Black))
    val finished = step.game.finish(chess.Status.VariantEnd, Some(Color.Black))
    assertEquals(JsonView.goResult(finished), Some("B+0.5"))
    assertEquals((Event.EndData(finished, None).data \ "result").as[String], "B+0.5")
    assert(finished.goScoring.isDefined, "the count stays as the record")

  test("equal totals are jigo: the game ends with no winner"):
    val g0 = opened().game
    val even = count.copy(white = count.white.copy(total = 12))
    val g = counted(g0, reply(g0, 1, geDead, c = even), t0).ok.game
    val step = accept(accept(g, Color.Black, v(1)).ok.game, Color.White, v(1)).ok
    assertEquals(step.ending.map(_.winner), Some(None))
    assertEquals(
      JsonView.goResult(step.game.finish(chess.Status.VariantEnd, None)),
      Some("0")
    )

  test(
    "resuming drops the marks, gives the move to the second passer's opponent (Black) and restarts the clock"
  ):
    val g = proposed()
    val step = resume(g, at(30)).ok
    val r = step.game
    assertEquals(r.goScoring, None)
    assertEquals(r.go.get.actions.last, Action.Resume)
    assertEquals(r.turnColor, Color.Black)
    assert(r.clock.exists(_.isRunning), "the clock runs again")
    assertEquals(r.clock.map(_.color), Some(Color.Black))
    assertEquals(r.movedAt, at(30))
    assertEquals(r.ply, g.ply, "a resume is not a ply")
    val js =
      step.progress.events.collectFirst { case e: Event.GoResume => e.data }.getOrElse(fail("no event"))
    assertEquals((js \ "turn").as[String], "black")
    // the next two passes open phase 2, whose refs start again at 1
    val again = opened(playAll(r, "pass", "pass"))
    assertEquals((again.request.get \ "ref").as[String], s"${g.id}:2:1")
    // no stone since the last resume: resuming again is refused (R-SP-9)
    assert(resume(again.game, at(40)).isLeft)

  test("the second pass earns its byo-yomi period back, so a resume gives the full period"):
    var ms = 1_000_000L
    val config = ligo.gorules.ByoyomiConfig(mainSeconds = 0, periods = 3, periodSeconds = 30)
    val g0 =
      newGo().copy(byoyomi = ligo.gorules.ByoyomiClock(config, ligo.gorules.Color.Black, () => ms).toOption)
    val g1 = playAll(g0, "aa", "ee", "ba", "gg", "pass", "gh", "pass")
    ms += 20_000 // White thinks 20 s of a 30 s period, then passes second
    val g = opened(play(g1, Action.Pass)).game
    assertEquals(g.byoyomi.get.reading(ligo.gorules.Color.White).centis, 3000)
    val r = resume(g, at(30)).ok.game
    val r2 = play(r, Action.Place(p("cc")))
    assertEquals(
      r2.byoyomi.get.reading(ligo.gorules.Color.White).centis,
      3000,
      "White's next period is whole"
    )
    assertEquals(r2.byoyomi.get.reading(ligo.gorules.Color.White).periodsLeft, 3)

  test("the second pass earns its Fischer increment"):
    val g1 = playAll(newGo(Some(fischer)), "aa", "ee", "ba", "gg", "pass", "gh", "pass")
    val before = g1.clock.get.remainingTime(Color.White)
    val g = play(g1, Action.Pass)
    assert(g.clock.get.remainingTime(Color.White) > before, "the increment was added")

  test("the deadline: no proposal ends with no result; marks on show stand"):
    val waiting = opened().game
    assertEquals(expire(waiting, at(599)), None)
    assertEquals(expire(waiting, at(600)).flatMap(_.ending), Some(Ending.NoCount))
    val g = proposed()
    assertEquals(expire(g, at(189)), None)
    assertEquals(expire(g, at(190)).flatMap(_.ending), Some(Ending.Scored(GameResult.Scored(12, 11.5))))

  test(
    "a recount pending at the deadline is waited for once, then the game ends with it or without a result"
  ):
    val g = toggle(proposed(), p("aa"), v(1)).ok.game
    val waited = expire(g, at(190)).getOrElse(fail("no step"))
    assertEquals(waited.ending, None)
    assert(waited.game.goScoring.get.overtime)
    assertEquals(waited.game.goScoring.get.expiresAt, at(790))
    val sc = waited.game.goScoring.get
    val arrived = counted(waited.game, reply(g, 2, sc.dead, proposal = false), at(200)).ok
    assertEquals(arrived.ending, Some(Ending.Scored(GameResult.Scored(12, 11.5))))
    assertEquals(expire(waited.game, at(790)).flatMap(_.ending), Some(Ending.NoCount))

  test("a correspondence game waits a day for the proposal and gives a day to agree"):
    val g = opened(ended(newGo(days = Some(Days(3))))).game
    assertEquals(g.goScoring.get.expiresAt, at(86400))
    val proposedG = counted(g, reply(g, 1, geDead), at(10)).ok.game
    assertEquals(proposedG.goScoring.get.expiresAt, at(10 + 86400))

  test("the scoring phase is stored under sc and read back; resuming removes it"):
    val g = toggle(accept(proposed(), Color.Black, v(1)).ok.game, p("gg"), v(1)).ok.game
    val doc = gameHandler.write(g)
    val sc = doc.getAsOpt[BSONDocument]("sc").getOrElse(fail("no sc"))
    assertEquals(sc.getAsOpt[Int]("q"), Some(2))
    assertEquals(sc.getAsOpt[Int]("cv"), Some(1))
    assertEquals(sc.getAsOpt[String]("src"), Some("k"))
    assertEquals(sc.getAsOpt[Boolean]("pn"), Some(true))
    assertEquals(sc.getAsOpt[List[Int]]("sw"), Some(List(5, 0, 0, 13, 0, 23)))
    val back = gameHandler.read(doc)
    assertEquals(back.goScoring, g.goScoring)
    val accepted = accept(proposed(), Color.White, v(1)).ok.game
    assertEquals(
      gameHandler.read(gameHandler.write(accepted)).goScoring.get.accepted,
      Set(ligo.gorules.Color.White)
    )
    val (sets, _) = GameDiff(opened().game, proposed())
    assert(sets.exists(_._1 == "sc"))
    val (_, unsets) = GameDiff(g, resume(proposed(), at(30)).ok.game)
    assert(unsets.exists(_._1 == "sc"), unsets.toString)

  test("an unreadable sc loads the game without it instead of failing"):
    val doc = gameHandler.write(proposed()) ++ BSONDocument("sc" -> BSONDocument("q" -> 1))
    assertEquals(gameHandler.read(doc).goScoring, None)

  test("the move cap opens the phase without passes, closes play, and nobody can resume"):
    // a game still in play at the 1,000-ply cap (built by hand: playing 1,000 moves isn't needed)
    val g = playAll(newGo(Some(fischer)), "aa", "ee")
    val capped = g.copy(ply = g.startedAtPly + lila.core.game.GoBridge.maxPlies)
    assert(capped.goPlayEnds)
    assertEquals(capped.go.get.phase, ligo.gorules.Phase.Play)
    val step = opened(capped)
    assert(step.game.go.get.playClosed)
    assertEquals(step.game.go.get.phase, ligo.gorules.Phase.Scoring)
    assert(resume(step.game, at(1)).isLeft)

  test("the service's messages are read as ADR 0020 §1 writes them"):
    val js = Json.parse(
      """{"t":"proposal","ref":"abcd1234:1:1","src":"katago","dead":["pd"],"seal":["ee"],
        |"owner":"bbbww.d..","score":{"b":{"territory":40,"stones":0,"prisoners":4,"total":44},
        |"w":{"territory":30,"stones":0,"prisoners":5,"komi":6.5,"compensation":0,"total":41.5}}}""".stripMargin
    )
    Reply.parse(js) match
      case Some(r: Reply.Counted) =>
        assertEquals(r.ref, Ref(GameId("abcd1234"), 1, 1))
        assertEquals(r.source, Some(GoScoring.Source.KataGo))
        assertEquals(r.dead, Set(p("pd")))
        assertEquals(r.count.white.total, BigDecimal(41.5))
      case other => fail(s"read $other")
    assertEquals(Reply.parse(Json.obj("t" -> "start")), Some(Reply.Start))
    assertEquals(
      Reply.parse(Json.obj("t" -> "error", "ref" -> "abcd1234:1:2", "message" -> "bad")),
      Some(Reply.Failed(Some(Ref(GameId("abcd1234"), 1, 2)), "bad"))
    )
    assertEquals(Reply.parse(Json.obj("t" -> "proposal", "ref" -> "x")), None)
    assertEquals(Reply.parse(Json.obj("t" -> "other")), None)
