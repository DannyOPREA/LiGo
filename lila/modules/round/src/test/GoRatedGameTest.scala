package lila.round

import chess.{ ByColor, Color, Outcome, Rated, Status }
import chess.rating.glicko.Glicko
import ligo.gorules.{ Action, BoardSize, Point, Position, Ruleset, Setup as GoSetup }
import scalalib.Maths.isCloseTo

import lila.core.game.{ Game, Player, Source, newGoGame }
import lila.core.id.GamePlayerId
import lila.core.perf.Perf
import lila.game.GameExt.finish
import lila.rating.GoRating
import lila.rating.PerfExt.addOrResetCapped

// Unit 5.3: a finished rated Go game moves its players' `go` ratings with handicap.
class GoRatedGameTest extends munit.FunSuite:

  private def perf(rating: Double, deviation: Double, nb: Int = 10) =
    Perf(Glicko(rating, deviation, 0.06), nb, Nil, None)

  // a rated Go game with a few moves played, resigned by the loser
  private def resigned(setup: GoSetup, winner: Color): Game =
    val g0 = newGoGame(
      setup,
      none,
      ByColor(c => Player(GamePlayerId(if c.white then "wwww" else "bbbb"), c, aiLevel = none)),
      rated = Rated.Yes,
      source = Source.Lobby
    ).fold(e => fail(e.message), _.start.sloppy)
    val played = List("cc", "gg", "cg", "gc").foldLeft(g0): (g, sgf) =>
      g.withGo(g.go.get(Action.Place(Point.fromSgf(sgf).get)).fold(r => fail(r.key), identity))
    played.finish(Status.Resign, winner.some)

  private def rate(game: Game, before: ByColor[Perf]): ByColor[Glicko] =
    GoRatedGame
      .glickos(game.go.get.setup, before, game.outcome.getOrElse(fail("not finished")))
      .fold(fail(_), identity)

  test("an even game rates as Go's Glicko-2 with only komi's small shift"):
    val game = resigned(GoSetup(BoardSize.Nineteen, Ruleset.Japanese, 6.5), Color.White)
    val before = ByColor(white = perf(1500, 100), black = perf(1500, 100))
    val after = rate(game, before)
    // goratings counts 6.5 komi as half a point over its fair 6: a 24th of a rank for White
    val diff = GoRatedGame.rankDifference(game.go.get.setup)
    assert(isCloseTo(diff, -0.5 / 12, 1e-12), s"$diff")
    assert(after.white.rating > 1500 && after.black.rating < 1500)
    val expected = GoRating.rateGame(before.map(GoRatedGame.player), Outcome(Color.White.some), diff).get
    assertEquals(after, expected)

  test("the memo's 4-stone game, end to end from the finished game"):
    // 4.5k (Black) beats 0.5d (White), 19x19 Japanese, komi 0.5, both deviation 80
    val game = resigned(GoSetup(BoardSize.Nineteen, Ruleset.Japanese, 0.5, handicap = 4), Color.Black)
    assertEquals(game.outcome, Some(Outcome(Color.Black.some)))
    val after = rate(game, ByColor(white = perf(1960.378534, 80), black = perf(1579.573482, 80)))
    assert(isCloseTo(after.black.rating, 1602.038166, 1e-3), s"black ${after.black.rating}")
    assert(isCloseTo(after.white.rating, 1937.119169, 1e-3), s"white ${after.white.rating}")

  test("a handicap game moves ratings less than the same result would in an even game"):
    val before = ByColor(white = perf(1960, 80), black = perf(1580, 80))
    val handicap =
      rate(resigned(GoSetup(BoardSize.Nineteen, Ruleset.Chinese, 0.5, handicap = 5), Color.Black), before)
    val even = rate(resigned(GoSetup(BoardSize.Nineteen, Ruleset.Chinese, 7.5), Color.Black), before)
    assert(handicap.black.rating - 1580 < even.black.rating - 1580)
    assert(1960 - handicap.white.rating < 1960 - even.white.rating)
    // on 9x9 a stone is worth 6 ranks, so one stone already shifts ratings a lot
    val nine = GoSetup(BoardSize.Nine, Ruleset.Japanese, 0.5, handicap = 2)
    assert(
      isCloseTo(
        GoRatedGame.rankDifference(nine),
        6 * GoRatedGame.rankDifference(nine.copy(size = BoardSize.Nineteen)),
        1e-9
      )
    )

  test("games ADR 0021 keeps casual are never rated"):
    def refused(setup: GoSetup) = assert(GoRatedGame.refusal(setup).isDefined, s"$setup")
    def accepted(setup: GoSetup) = assertEquals(GoRatedGame.refusal(setup), None, s"$setup")
    accepted(GoSetup(BoardSize.Nineteen, Ruleset.Japanese, 6.5))
    accepted(GoSetup(BoardSize.Nineteen, Ruleset.Chinese, 7.5))
    accepted(GoSetup(BoardSize.Nineteen, Ruleset.Japanese, 0.5, handicap = 1))
    accepted(GoSetup(BoardSize.Nineteen, Ruleset.Chinese, 0.5, handicap = 9))
    accepted(GoSetup(BoardSize.Nine, Ruleset.Japanese, 0.5, handicap = 4))
    accepted(GoSetup(BoardSize.Thirteen, Ruleset.Japanese, 6.5))
    refused(GoSetup(BoardSize.Nineteen, Ruleset.Japanese, 5.5)) // not the spec's komi
    refused(GoSetup(BoardSize.Nineteen, Ruleset.Japanese, 6.5, handicap = 3)) // handicap with even komi
    refused(GoSetup(BoardSize.Nine, Ruleset.Japanese, 0.5, handicap = 5))
    refused(GoSetup(BoardSize.Thirteen, Ruleset.Japanese, 0.5, handicap = 2))
    refused(
      GoSetup(
        BoardSize.Nine,
        Ruleset.Japanese,
        6.5,
        position = Position(Map.empty, ligo.gorules.Color.Black).some
      )
    )
    val game = resigned(GoSetup(BoardSize.Nineteen, Ruleset.Japanese, 5.5), Color.White)
    assert(GoRatedGame.glickos(game.go.get.setup, ByColor.fill(perf(1500, 100)), game.outcome.get).isLeft)

  test("a new Go rating keeps OGS's volatility ceiling, not lila's chess one"):
    val stored = perf(1500, 100).addOrResetCapped(lila.mon.round.error.glicko, "test", GoRating.cap)(
      Glicko(1520, 90, 0.14),
      nowInstant
    )
    assertEquals(stored.glicko.volatility, 0.14)
    assertEquals(stored.nb, 11)
    assertEquals(
      GoRatedGame.player(perf(1500, 100).copy(glicko = Glicko(1500, 100, 0.3))).glicko.volatility,
      0.15
    )
