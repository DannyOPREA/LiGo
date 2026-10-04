package lila.round

import chess.{ ByColor, Color, Rated, Status }
import chess.rating.IntRatingDiff
import chess.rating.glicko.Glicko
import ligo.gorules.{ Action, BoardSize, Point, Position, Ruleset, Setup as GoSetup }
import scalalib.Maths.isCloseTo

import lila.core.game.{ Game, Player, Source, newGoGame }
import lila.core.id.GamePlayerId
import lila.core.perf.{ Perf, UserPerfs }
import lila.game.GameExt.finish
import lila.rating.GoRating
import lila.rating.PerfExt.addOrResetCapped

// Unit 5.3: a finished rated Go game moves its players' `go` ratings with handicap. The expected
// values are goratings' own (5.2's goRatingCases.json, "handicapGames"), not this code's.
class GoRatedGameTest extends munit.FunSuite:

  private def perf(rating: Double, deviation: Double, volatility: Double = 0.06, nb: Int = 10) =
    Perf(Glicko(rating, deviation, volatility), nb, Nil, None)

  private def perfs(color: Color, go: Perf): UserPerfs =
    lila.rating.UserPerfs.default(UserId(color.fold("white", "black"))).copy(go = go)

  // a rated Go game with a few moves played, ended by `status` with `winner`
  private def ended(setup: GoSetup, status: Status, winner: Color): Game =
    val g0 = newGoGame(
      setup,
      none,
      ByColor(c => Player(GamePlayerId(if c.white then "wwww" else "bbbb"), c, aiLevel = none)),
      rated = Rated.Yes,
      source = Source.Lobby
    ).fold(e => fail(e.message), _.start.sloppy.copy(rated = Rated.Yes)) // newGoGame is casual until 5.7
    val played = List("ab", "ba", "ac", "ca").foldLeft(g0): (g, sgf) =>
      g.withGo(g.go(Action.Place(Point.fromSgf(sgf).get)).fold(r => fail(r.key), identity))
    played.finish(status, winner.some)

  // what PerfsUpdater stores: the new `go` perfs and the rating changes it writes on the game
  private def rated(game: Game, go: ByColor[Perf]): (ByColor[Perf], ByColor[IntRatingDiff]) =
    val (diffs, after, key) = PerfsUpdater
      .newPerfs(game, go.mapWithColor(perfs), ByColor.fill(false))
      .getOrElse(fail("the game was not rated"))
    assertEquals(key, PerfKey.go)
    (after.map(_.go), diffs)

  private def assertGlicko(obtained: Perf, expected: (Double, Double, Double), clue: String) =
    val g = obtained.glicko
    assert(isCloseTo(g.rating, expected._1, 1e-6), s"$clue rating ${g.rating} vs ${expected._1}")
    assert(isCloseTo(g.deviation, expected._2, 1e-6), s"$clue deviation ${g.deviation}")
    assert(isCloseTo(g.volatility, expected._3, 1e-6), s"$clue volatility ${g.volatility}")

  test("an even 19x19 game won by resignation moves both ratings as goratings does"):
    val game = ended(GoSetup(BoardSize.Nineteen, Ruleset.Japanese, 6.5), Status.Resign, Color.Black)
    val before = ByColor(white = perf(1387.5855603159134, 150), black = perf(1272.7401075592427, 200))
    val (after, diffs) = rated(game, before)
    assertGlicko(after.black, (1381.0409908942013, 179.33119434736668, 0.06000095734564371), "black")
    assertGlicko(after.white, (1325.1159319039564, 141.87291275858155, 0.060001133214264514), "white")
    // the game stores whole-point changes, as lila does (ratings rounded down)
    assertEquals(diffs, ByColor(white = IntRatingDiff(1325 - 1387), black = IntRatingDiff(1381 - 1272)))
    assertEquals(after.map(_.nb), ByColor.fill(11))
    assertEquals(after.black.latest, game.movedAt.some)

  test("the memo's 4-stone game, end to end from the finished game"):
    // 4.5k (Black) beats 0.5d (White), 19x19 Japanese, komi 0.5, both deviation 80
    val game =
      ended(GoSetup(BoardSize.Nineteen, Ruleset.Japanese, 0.5, handicap = 4), Status.Resign, Color.Black)
    val (after, _) =
      rated(game, ByColor(white = perf(1960.3785337143893, 80), black = perf(1579.5734822592087, 80)))
    assertGlicko(after.black, (1602.0381656717097, 78.87243311366268, 0.06000208587221337), "black")
    assertGlicko(after.white, (1937.1191691494953, 78.92564656669569, 0.06000251613718692), "white")

  test("a 9x9 two-stone game lost on time moves ratings as goratings does"):
    val game =
      ended(GoSetup(BoardSize.Nine, Ruleset.Japanese, 0.5, handicap = 2), Status.Outoftime, Color.White)
    val (after, _) =
      rated(game, ByColor(white = perf(1877.4998781668542, 90), black = perf(1512.7940698667778, 120)))
    assertGlicko(after.black, (1454.7976721466082, 116.07423592048178, 0.06000450672638978), "black")
    assertGlicko(after.white, (1914.1857222108188, 89.2978251207464, 0.06000672087167502), "white")

  test("a Go game leaves the chess perfs alone"):
    val game = ended(GoSetup(BoardSize.Nineteen, Ruleset.Japanese, 6.5), Status.Resign, Color.White)
    // an established chess blitz rating, which lila would fold into the standard one after a chess game
    val blitz = perf(1700, 60, nb = 30).copy(latest = nowInstant.some)
    val before = ByColor.fill(perf(1500, 100)).mapWithColor(perfs).map(_.copy(blitz = blitz))
    val (_, after, _) = PerfsUpdater.newPerfs(game, before, ByColor.fill(false)).get
    assertEquals(
      after.map(_.copy(go = lila.rating.Perf.default)),
      before.map(_.copy(go = lila.rating.Perf.default))
    )

  test("a stored Go rating keeps OGS's volatility ceiling, not lila's chess one"):
    // a volatility of 0.14 survives the game, where lila's chess cap would cut it to 0.1
    val game = ended(GoSetup(BoardSize.Nineteen, Ruleset.Japanese, 6.5), Status.Resign, Color.White)
    val (after, _) = rated(game, ByColor.fill(perf(1500, 100, volatility = 0.14)))
    assert(after.white.glicko.volatility > 0.13, s"${after.white.glicko.volatility}")
    val stored = perf(1500, 100).addOrResetCapped(lila.mon.round.error.glicko, "test", GoRating.cap)(
      Glicko(1520, 90, 0.18),
      nowInstant
    )
    assertEquals(stored.glicko.volatility, 0.15)

  test("games ADR 0021 keeps casual are never rated"):
    def refused(setup: GoSetup) = assert(GoRatedGame.refusal(setup).isDefined, s"$setup")
    def accepted(setup: GoSetup) = assertEquals(GoRatedGame.refusal(setup), None, s"$setup")
    accepted(GoSetup(BoardSize.Nineteen, Ruleset.Japanese, 6.5))
    accepted(GoSetup(BoardSize.Nineteen, Ruleset.Chinese, 7.5))
    accepted(GoSetup(BoardSize.Nineteen, Ruleset.Japanese, 0.5, handicap = 1))
    accepted(GoSetup(BoardSize.Nineteen, Ruleset.Chinese, 0.5, handicap = 9))
    accepted(GoSetup(BoardSize.Nine, Ruleset.Chinese, 7.5))
    accepted(GoSetup(BoardSize.Nine, Ruleset.Japanese, 0.5, handicap = 4))
    refused(GoSetup(BoardSize.Thirteen, Ruleset.Japanese, 6.5)) // server games are 9x9 and 19x19
    refused(GoSetup(BoardSize.Nineteen, Ruleset.Japanese, 5.5)) // not the spec's komi
    refused(GoSetup(BoardSize.Nineteen, Ruleset.Japanese, 6.5, handicap = 3)) // handicap with even komi
    refused(GoSetup(BoardSize.Nine, Ruleset.Japanese, 0.5, handicap = 5))
    refused(
      GoSetup(
        BoardSize.Nine,
        Ruleset.Japanese,
        6.5,
        position = Position(Map.empty, ligo.gorules.Color.Black).some
      )
    )
    val game = ended(GoSetup(BoardSize.Nineteen, Ruleset.Japanese, 5.5), Status.Resign, Color.White)
    assertEquals(
      PerfsUpdater.newPerfs(game, ByColor.fill(perf(1500, 100)).mapWithColor(perfs), ByColor.fill(false)),
      None
    )
