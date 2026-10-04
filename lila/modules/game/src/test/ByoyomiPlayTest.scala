package lila.game

import chess.{ ByColor, Centis, Color, MoveMetrics, Rated, Speed, Status }
import ligo.gorules.{
  Action,
  BoardSize,
  ByoyomiClock,
  ByoyomiConfig,
  Color as GoColor,
  Point,
  Ruleset,
  Setup as GoSetup
}
import play.api.libs.json.*
import reactivemongo.api.bson.*

import lila.core.game.{ Game, GameClock, Player, Source, newGoGame }
import lila.core.id.GamePlayerId
import lila.game.GameExt.*

// Unit 4.7 (ADR 0020 §7): a Go game with a byo-yomi clock, played, flagged, stored and sent to browsers.
class ByoyomiPlayTest extends munit.FunSuite:

  import BSONHandlers.gameHandler

  // A wall clock the tests move by hand.
  private class Wall:
    var ms = 1_000_000L
    def seconds(s: Double): Unit = ms += (s * 1000).toLong
    val now: () => Long = () => ms

  // 60 s main time, then 3 periods of 30 s
  private val config = ByoyomiConfig(mainSeconds = 60, periods = 3, periodSeconds = 30)

  private def newGo(handicap: Int = 0)(using w: Wall): Game =
    val first = if handicap > 1 then GoColor.White else GoColor.Black
    newGoGame(
      GoSetup(BoardSize.Nine, Ruleset.Japanese, if handicap > 0 then 0.5 else 6.5, handicap),
      None,
      ByColor(c => Player(GamePlayerId(if c.white then "wwww" else "bbbb"), c, aiLevel = none)),
      rated = Rated.No,
      source = Source.Lobby
    ).fold(e => fail(e.message), _.start.sloppy)
      .copy(byoyomi = ByoyomiClock(config, first, w.now).toOption)

  private def p(sgf: String) = Point.fromSgf(sgf).get

  private def created(
      byoyomi: Option[ByoyomiConfig],
      fischer: Option[chess.Clock] = None,
      source: Source = Source.Lobby
  ) =
    newGoGame(
      GoSetup(BoardSize.Nine, Ruleset.Japanese, 6.5, 0),
      fischer,
      ByColor(c => Player(GamePlayerId(if c.white then "wwww" else "bbbb"), c, aiLevel = none)),
      rated = Rated.No,
      source = source,
      byoyomi = byoyomi
    )

  test("a new Go game can be created with a byo-yomi clock, which replaces any Fischer clock"):
    val g =
      created(Some(config), Some(chess.Clock(chess.Clock.LimitSeconds(60), chess.Clock.IncrementSeconds(2))))
        .fold(e => fail(e.message), _.sloppy)
    assertEquals(g.clock, None)
    assertEquals(g.byoyomi.map(_.config), Some(config))
    assertEquals(g.byoyomi.map(_.toMove), Some(GoColor.Black))
    assert(!g.byoyomi.get.isRunning)
    val bad = ByoyomiConfig(60, 0, 30)
    assertEquals(created(Some(bad)).map(_.sloppy.id), Left(ligo.gorules.SetupError.BadByoyomi(bad)))

  test("a byo-yomi lobby game nobody starts expires, as a Fischer one does"):
    val g = created(Some(config)).fold(e => fail(e.message), _.start.sloppy)
    assert(g.expirable, "the first-move countdown applies")

  // What the round does for a move the rules accepted: step the clock, then apply.
  private def play(g: Game, action: Action, metrics: MoveMetrics = MoveMetrics()): Progress =
    val next = g.go.get(action).fold(r => fail(s"refused $action: ${r.key}"), identity)
    g.applyGoMove(next, g.stepGoClock(metrics, gameActive = g.goClockActiveAfter(next)).map(_.value))

  // Black thinks `s` seconds, then White answers at once.
  private def round(g: Game, black: String, white: String, s: Double)(using w: Wall): Game =
    w.seconds(s)
    val g1 = play(g, Action.Place(p(black))).game
    play(g1, Action.Place(p(white))).game

  private def clockJson(progress: Progress): JsObject =
    progress.events
      .collectFirst { case e: Event.GoMove => e.data.as[JsObject] }
      .flatMap(js => (js \ "clock").asOpt[JsObject])
      .getOrElse(fail("no clock in the move event"))

  private def reading(g: Game, c: GoColor) = g.byoyomi.get.reading(c)

  test("a byo-yomi game has a clock, no Fischer settings, and a speed from its expected length"):
    given Wall = Wall()
    val g = newGo()
    assert(g.hasClock)
    assertEquals(g.clock, None)
    assertEquals(g.clockConfig, None)
    assert(g.gameClock.exists { case GameClock.Byoyomi(_) => true; case _ => false })
    assertNotEquals(g.speed, Speed.Correspondence)
    assert(!g.isCorrespondence)

  test("the clock starts once both sides have played, then charges main time to the mover"):
    given w: Wall = Wall()
    val g1 = play(newGo(), Action.Place(p("ee"))).game
    assert(!g1.byoyomi.get.isRunning)
    val g2 = play(g1, Action.Place(p("cc"))).game
    assert(g2.byoyomi.get.isRunning)
    assertEquals(g2.byoyomi.get.toMove, GoColor.Black)
    w.seconds(10)
    val g3 = play(g2, Action.Place(p("gg"))).game
    assertEquals(reading(g3, GoColor.Black).centis, 5000)
    assertEquals(reading(g3, GoColor.White).centis, 6000)
    assertEquals(g3.byoyomi.get.toMove, GoColor.White)
    assertEquals(g3.clockHistory.map(h => (h.black.size, h.white.size)), Some((2, 1)))

  test("the move event carries both clocks, each side's periods left and the period length"):
    given w: Wall = Wall()
    val g2 = playAll(newGo(), "ee", "cc")
    w.seconds(75) // main time and 15 s of the first period
    val progress = play(g2, Action.Place(p("gg")))
    val js = clockJson(progress)
    assertEquals((js \ "black").as[Double], 30d) // a move within a period keeps it, full again
    assertEquals((js \ "white").as[Double], 60d)
    assertEquals((js \ "periods" \ "b").as[Int], 3)
    assertEquals((js \ "periods" \ "w").as[Int], 3)
    assertEquals((js \ "byo").as[Int], 30)
    assertEquals((js \ "inByo").as[JsObject], Json.obj("b" -> true, "w" -> false))

  test("a period that runs out is used up; the last one running out is out of time"):
    given w: Wall = Wall()
    val g2 = playAll(newGo(), "ee", "cc")
    val g4 = round(g2, "gg", "gc", 95) // 60 s main, 30 s first period gone, 5 s into the second
    assertEquals(reading(g4, GoColor.Black).periodsLeft, 2)
    assert(!g4.outoftime(withGrace = false))
    w.seconds(61) // Black lets the last two periods run out
    assert(g4.byoyomi.get.outOfTime(GoColor.Black))
    assert(g4.outoftime(withGrace = false), "lila flags Black")
    // the round refuses the late move: the stepped clock is out of time
    val stepped = g4.stepGoClock(MoveMetrics(), gameActive = true)
    assert(stepped.exists(_.value.outOfTime(Color.Black, withGrace = false)))

  test("the scoring phase stops the clock; finishing stops it too"):
    given w: Wall = Wall()
    val g2 = playAll(newGo(), "ee", "cc")
    val passed = play(play(g2, Action.Pass).game, Action.Pass).game
    val scoring = GoScoringPlay.open(passed, java.time.Instant.EPOCH).getOrElse(fail("no phase")).game
    assert(!scoring.byoyomi.get.isRunning)
    val g3 = play(g2, Action.Place(p("gg"))).game
    assert(g3.byoyomi.get.isRunning)
    val finished = g3.finish(Status.Resign, Some(Color.Black))
    assert(!finished.byoyomi.get.isRunning)

  test("a takeback gives the turn back, keeping time already used"):
    given w: Wall = Wall()
    val g2 = playAll(newGo(), "ee", "cc")
    w.seconds(10)
    val g3 = play(g2, Action.Place(p("gg"))).game
    val back = Rewind.go(g3).fold(fail(_), _.game)
    assertEquals(back.turnColor, Color.Black)
    assertEquals(back.byoyomi.get.toMove, GoColor.Black)
    assertEquals(reading(back, GoColor.Black).centis, 5000)
    assertEquals(back.clockHistory.map(h => (h.black.size, h.white.size)), Some((1, 1)))

  test("a handicap game runs White's clock first"):
    given w: Wall = Wall()
    val g0 = newGo(handicap = 3)
    assertEquals((g0.turnColor, g0.byoyomi.get.toMove), (Color.White, GoColor.White))

  test("stored under cy: the settings, time used, periods and the running clock come back"):
    given w: Wall = Wall()
    val g2 = playAll(newGo(), "ee", "cc")
    val g4 = round(g2, "gg", "gc", 95)
    val doc = gameHandler.write(g4)
    assertEquals(doc.getAsOpt[BSONDocument]("c"), None, "no Fischer clock")
    val cy = doc.getAsOpt[BSONDocument]("cy").getOrElse(fail("no cy"))
    assertEquals(cy.getAsOpt[Int]("m"), Some(60))
    assertEquals(cy.getAsOpt[Int]("n"), Some(3))
    assertEquals(cy.getAsOpt[Int]("p"), Some(30))
    assertEquals(cy.getAsOpt[Int]("bp"), Some(2)) // the first period and the one in progress
    assert(cy.getAsOpt[Long]("r").isDefined, "running")
    val back = gameHandler.read(doc)
    assertEquals(back.byoyomi.map(_.state), g4.byoyomi.map(_.state))
    // lila's clock-history encoding is lossy (a few centiseconds, as for Fischer clocks)
    for color <- Color.all do
      val (got, want) = (back.clockHistory.get(color), g4.clockHistory.get(color))
      assertEquals(got.size, want.size)
      got.zip(want).foreach((a, b) => assert((a - b).centis.abs <= 10, s"$color: $got vs $want"))
    assertEquals(back.clock, None)

  test("GameDiff writes cy and the clock history when the clock changes"):
    given w: Wall = Wall()
    val g2 = playAll(newGo(), "ee", "cc")
    w.seconds(10)
    val g3 = play(g2, Action.Place(p("gg"))).game
    val (sets, unsets) = GameDiff(g2, g3)
    assert(Set("cy", "cb").subsetOf(sets.map(_._1).toSet), sets.map(_._1).toString)
    assertEquals(unsets, Nil)
    val back = gameHandler.read(gameHandler.write(g2) ++ BSONDocument(sets))
    assertEquals(back.byoyomi.map(_.state), g3.byoyomi.map(_.state))

  test("the round's clock JSON: Fischer's keys plus periods and the period length"):
    given w: Wall = Wall()
    val js = JsonView.gameClockJson(newGo().gameClock.get)
    assertEquals((js \ "initial").as[Int], 60)
    assertEquals((js \ "increment").as[Int], 0)
    assertEquals((js \ "white").as[Double], 60d)
    assertEquals((js \ "running").as[Boolean], false)
    assertEquals((js \ "periods" \ "b").as[Int], 3)
    assertEquals((js \ "byo").as[Int], 30)
    assertEquals((js \ "emerg").as[Int], 10)
    assertEquals((js \ "inByo").as[JsObject], Json.obj("b" -> false, "w" -> false))

  private def playAll(g: Game, moves: String*): Game =
    moves.foldLeft(g)((g, m) => play(g, Action.Place(p(m))).game)

  test("an unreadable cy loads the game without a byo-yomi clock instead of failing"):
    given w: Wall = Wall()
    val doc = (gameHandler.write(newGo()) -- "cy") ++ BSONDocument("cy" -> BSONDocument("m" -> 60))
    assertEquals(gameHandler.read(doc).byoyomi, None)

  test("the end-of-game event carries the byo-yomi clocks"):
    given w: Wall = Wall()
    val g = playAll(newGo(), "ee", "cc").finish(Status.Resign, Some(Color.White))
    val js = Event.EndData(g, None).data.as[JsObject]
    assertEquals((js \ "clock" \ "wc").as[Int], 6000)
