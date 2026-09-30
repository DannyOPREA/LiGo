package lila.game

import chess.{ ByColor, Centis, Clock, Color, MoveMetrics, Ply, Rated }
import ligo.gorules.{ Action, BoardSize, GoGame, Point, Ruleset, Setup as GoSetup }
import play.api.libs.json.*

import lila.core.game.{ Game, Player, Source, newGoGame }
import lila.core.id.GamePlayerId
import lila.game.GameExt.*

// Unit 3.13 (ADR 0019 §5–7): a Go move applied to lila's game: ply, clock, move event and takebacks.
class GoPlayTest extends munit.FunSuite:

  private def newGo(handicap: Int = 0): Game =
    newGoGame(
      GoSetup(BoardSize.Nine, Ruleset.Japanese, if handicap > 0 then 0.5 else 6.5, handicap),
      Clock(Clock.LimitSeconds(60), Clock.IncrementSeconds(2)).some,
      ByColor(c => Player(GamePlayerId(if c.white then "wwww" else "bbbb"), c, aiLevel = none)),
      rated = Rated.No,
      source = Source.Lobby
    ).fold(e => fail(e.message), _.start.sloppy)

  private def p(sgf: String) = Point.fromSgf(sgf).get

  /** What the round does for a move the rules accepted: step the clock, then apply. */
  private def play(g: Game, action: Action): Progress =
    val next = g.go.get(action).fold(r => fail(s"refused $action: ${r.key}"), identity)
    g.applyGoMove(next, g.stepGoClock(MoveMetrics()).map(_.value))

  private def playAll(g: Game, actions: Action*): Game = actions.foldLeft(g)(play(_, _).game)

  private def moveJson(progress: Progress): JsObject =
    progress.events
      .collectFirst { case e: Event.GoMove => e.data.as[JsObject] }
      .getOrElse(fail("no move event"))

  test("a stone: ply, turn and the move event"):
    val progress = play(newGo(), Action.Place(p("ee")))
    val g = progress.game
    assertEquals((g.ply, g.turnColor, g.playedPlies), (Ply(2), Color.White, Ply(1)))
    assertEquals(g.go.get.actions, Vector(Action.Place(p("ee"))))
    val js = moveJson(progress)
    assertEquals((js \ "p").as[String], "ee")
    assertEquals((js \ "ply").as[Int], 2)
    assertEquals((js \ "cap").as[List[String]], Nil)
    assertEquals((js \ "board").as[String], "9/9/9/9/4b4/9/9/9/9")
    assertEquals((js \ "phase").as[String], "play")
    assert((js \ "dests").toOption.isEmpty, "no legal moves sent")
    assertEquals(progress.events.collectFirst { case e: Event.GoMove => e.moveBy }, Some(Some(Color.Black)))

  test("a pass, and two passes open the scoring phase"):
    val once = play(newGo(), Action.Pass)
    assertEquals((moveJson(once) \ "pass").as[Boolean], true)
    assertEquals(once.game.go.get.phase, ligo.gorules.Phase.Play)
    val twice = play(once.game, Action.Pass)
    assertEquals((moveJson(twice) \ "phase").as[String], "scoring")
    assertEquals(twice.game.playedPlies, Ply(2))

  test("a capture is listed with the prisoners"):
    val before = playAll(newGo(), List("ab", "aa").map(s => Action.Place(p(s)))*)
    val progress = play(before, Action.Place(p("ba")))
    val js = moveJson(progress)
    assertEquals((js \ "cap").as[List[String]], List("aa"))
    assertEquals((js \ "prisoners" \ "b").as[Int], 1)
    assertEquals((js \ "prisoners" \ "w").as[Int], 0)

  test("a Black-first game runs Black's clock first, and starts it once both sides have played"):
    val g0 = newGo()
    assertEquals(g0.clock.map(_.color), Some(Color.Black))
    val g1 = play(g0, Action.Place(p("ee"))).game
    assertEquals(g1.clock.map(c => (c.color, c.isRunning)), Some((Color.White, false)))
    val g2 = play(g1, Action.Place(p("cc"))).game
    assertEquals(g2.clock.map(c => (c.color, c.isRunning)), Some((Color.Black, true)))
    assertEquals(g2.turnColor, Color.Black)
    // clock history: one entry per move, recorded for the side that moved
    assertEquals(g2.clockHistory.map(h => (h.black.size, h.white.size)), Some((1, 1)))

  test("a handicap game runs White's clock first"):
    val g0 = newGo(handicap = 3)
    assertEquals((g0.turnColor, g0.clock.map(_.color)), (Color.White, Some(Color.White)))
    val g1 = play(g0, Action.Place(p("ee"))).game
    assertEquals((g1.turnColor, g1.clock.map(_.color)), (Color.Black, Some(Color.Black)))

  test("a takeback undoes the last action and its clock history"):
    val g2 = playAll(newGo(), Action.Place(p("ee")), Action.Place(p("cc")))
    val g3 = play(g2, Action.Place(p("gg"))).game
    val back = Rewind.go(g3).fold(fail(_), _.game)
    assertEquals(back.go.get.actions, g2.go.get.actions)
    assertEquals(back.go.get.stones, g2.go.get.stones)
    assertEquals((back.ply, back.turnColor), (g2.ply, g2.turnColor))
    assertEquals(back.clockHistory.map(h => (h.black.size, h.white.size)), Some((1, 1)))
    assertEquals(back.clock.map(_.color), Some(Color.Black))
    assert(Rewind.go(newGo()).isLeft, "nothing to take back")

  test("Go games have no draws"):
    val g = playAll(newGo(), Action.Place(p("ee")), Action.Place(p("cc")), Action.Place(p("gg")))
    assert(g.playable && !g.abortable)
    assert(!g.drawable)

  test("the clock doesn't run before both sides have played, then a move earns the increment"):
    val g1 = play(newGo(), Action.Place(p("ee"))).game
    val g2 = play(g1, Action.Place(p("cc"))).game
    assertEquals(g2.clock.map(_.remainingTime(Color.Black)), Some(Centis(6000)))
    assertEquals(g2.clock.map(_.remainingTime(Color.White)), Some(Centis(6000)))
    val g3 = play(g2, Action.Place(p("gg"))).game
    // Black moved at once on a running clock: its 2 s increment outweighs the time it used
    assert(
      g3.clock.exists(_.remainingTime(Color.Black) > Centis(6000)),
      g3.clock.map(_.remainingTime(Color.Black))
    )
    assertEquals(g3.clock.map(c => (c.color, c.isRunning)), Some((Color.White, true)))
