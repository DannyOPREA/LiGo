package lila.round

import chess.{ ByColor, Color, Rated }
import ligo.gorules.{ Action, BoardSize, Point, Ruleset, Setup as GoSetup }
import scalalib.model.Days

import lila.core.game.{ Game, GoScoring, Player, Source, newGoGame }
import lila.core.id.GamePlayerId
import lila.game.GoScoringPlay
import lila.game.GameExt.*
import lila.round.GoScorer.CorresStep

// Unit 7.6 (ADR 0023 §4): what a step of a correspondence game's scoring phase means for alarms and
// notifications, and when a scoring-phase alarm rings.
class CorresScoringTest extends munit.FunSuite:

  private val t0 = java.time.Instant.parse("2026-10-04T12:00:00Z")
  private val day = 86_400L

  private def newGame(days: Option[Days]): Game =
    newGoGame(
      GoSetup(BoardSize.Nine, Ruleset.Japanese, 6.5, 0),
      Option.when(days.isEmpty)(chess.Clock(chess.Clock.LimitSeconds(300), chess.Clock.IncrementSeconds(5))),
      ByColor(c => Player(GamePlayerId(if c.white then "wwww" else "bbbb"), c, aiLevel = none)),
      rated = Rated.No,
      source = Source.Lobby,
      daysPerTurn = days
    ).fold(e => fail(e.message), _.start.sloppy)

  private def p(sgf: String) = Point.fromSgf(sgf).get

  private def twoPasses(g: Game): Game =
    List(Action.Place(p("cc")), Action.Place(p("ee")), Action.Pass, Action.Pass).foldLeft(g): (g, a) =>
      g.withGo(g.go(a).fold(r => fail(r.key), identity))

  private def opened(g: Game) = GoScoringPlay.open(g, t0).getOrElse(fail("the phase didn't open")).game

  private def withProposal(g: Game, at: java.time.Instant = t0.plusSeconds(10)): Game =
    g.copy(
      goScoring = g.goScoring.map(
        _.copy(
          proposal = Some(GoScoring.Proposal(Set.empty, GoScoring.Source.KataGo)),
          shown = 1,
          expiresAt = at.plusSeconds(day)
        )
      )
    )

  private val corres = twoPasses(newGame(Some(Days(3))))
  private val waiting = opened(corres)
  private val proposed = withProposal(waiting)

  test("the proposal arriving opens a correspondence game's phase for alarms and notifications"):
    assertEquals(GoScorer.corresStep(waiting, proposed), Some(CorresStep.Opened))

  test("opening the phase, before any proposal, is not yet the phase's day"):
    assertEquals(GoScorer.corresStep(corres, waiting), None)

  test("an accept, or a toggle that clears the accepts, tells the alarms who has accepted"):
    val blackAccepted =
      proposed.copy(goScoring = proposed.goScoring.map(_.copy(accepted = Set(ligo.gorules.Color.Black))))
    assertEquals(GoScorer.corresStep(proposed, blackAccepted), Some(CorresStep.Changed))
    assertEquals(GoScorer.corresStep(blackAccepted, proposed), Some(CorresStep.Changed))
    assertEquals(GoScorer.corresStep(proposed, proposed), None, "nothing changed")

  test("resuming play is a step of its own, so the day-clock alarm starts again"):
    assertEquals(GoScorer.corresStep(proposed, proposed.copy(goScoring = None)), Some(CorresStep.Resumed))

  test("a real-time game's phase has nothing to tell alarms or notifications"):
    val realTime = twoPasses(newGame(None))
    assert(!realTime.isCorrespondence)
    val w = opened(realTime)
    assertEquals(GoScorer.corresStep(w, withProposal(w)), None)

  test("a game that has ended has nothing to tell either"):
    assertEquals(GoScorer.corresStep(proposed, proposed.copy(status = chess.Status.VariantEnd)), None)

  test("a scoring-phase alarm rings at 80% of what is left of the phase's day, for who hasn't accepted"):
    val sc = proposed.goScoring.getOrElse(fail("no sc"))
    val opened = sc.expiresAt.minusSeconds(day) // when the proposal arrived
    assertEquals(
      CorresAlarm.scoringRingsAt(sc, Color.White, opened),
      Some((opened.plusSeconds(day * 8 / 10), opened.plusSeconds(day * 2)))
    )
    // later in the phase (a toggle cleared an accept): 80% of what is left
    val later = opened.plusSeconds(day / 2)
    assertEquals(
      CorresAlarm.scoringRingsAt(sc, Color.Black, later).map(_._1),
      Some(later.plusSeconds(day / 2 * 8 / 10))
    )

  test("accepting removes a player's alarm, and the phase has none before its proposal"):
    val sc = proposed.goScoring.getOrElse(fail("no sc"))
    val blackAccepted = sc.copy(accepted = Set(ligo.gorules.Color.Black))
    assertEquals(CorresAlarm.scoringRingsAt(blackAccepted, Color.Black, t0), None)
    assert(CorresAlarm.scoringRingsAt(blackAccepted, Color.White, t0).isDefined)
    val noProposal = waiting.goScoring.getOrElse(fail("no sc"))
    assertEquals(CorresAlarm.scoringRingsAt(noProposal, Color.White, t0), None)

  test("an alarm past the phase's deadline rings at once, not in the past"):
    val sc = proposed.goScoring.getOrElse(fail("no sc"))
    val after = sc.expiresAt.plusSeconds(60)
    assertEquals(CorresAlarm.scoringRingsAt(sc, Color.White, after).map(_._1), Some(after))
