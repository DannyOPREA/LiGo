package lila.security

import chess.rating.glicko.Glicko

import lila.rating.GoRating.Rank

// Unit 5.4: the account page's Go rank (ADR 0021 §2)
class GoRankChangeTest extends munit.FunSuite:

  private val handler = lila.rating.Perf.perfHandler
  private def stored(perf: Perf): Perf = handler.readTry(handler.writeTry(perf).get).get

  test("\"I don't know\" puts the Go rating back to lila's default"):
    assertEquals(GoRankChange.perfOf(None), lila.rating.Perf.default)
    assertEquals(GoRankChange.choiceOf(GoRankChange.perfOf(None)), "")
    assertEquals(GoRankChange.choiceOf(stored(GoRankChange.perfOf(None))), "")

  test("the page shows the rank a player declared, after it was stored and read back"):
    Rank.all.foreach: rank =>
      val perf = GoRankChange.perfOf(rank.some)
      assertEquals(perf.nb, 0)
      assertEquals(GoRankChange.choiceOf(perf), rank.name)
      assertEquals(GoRankChange.choiceOf(stored(perf)), rank.name)

  test("a 5k starts at 1580 with deviation 250, as at signup"):
    val g = GoRankChange.perfOf(Rank.Kyu(5).some).glicko
    assertEquals(g.rating.round.toInt, 1580)
    assertEquals(g.deviation, 250d)

  test("the rank can change until the first rated game starts"):
    val fresh = GoRankChange.perfOf(Rank.Kyu(5).some)
    assert(GoRankChange.open(fresh, hasRatedGame = false))
    // a rated game in progress (or finished but not yet counted) closes it
    assert(!GoRankChange.open(fresh, hasRatedGame = true))
    // a finished rated game has moved the rating
    assert(!GoRankChange.open(fresh.copy(nb = 1, glicko = Glicko(1600, 200, 0.06)), hasRatedGame = false))

  test("the form takes \"I don't know\" or a rank from 25k to 9d, and nothing else"):
    val form = SecurityForm.goRankForm
    List("", "25k", "5k", "1d", "9d").foreach: v =>
      assertEquals(form.bind(Map("goRank" -> v)).value, Some(v), v)
    List("10d", "26k", "5K", "1p", "dan").foreach: v =>
      assert(form.bind(Map("goRank" -> v)).hasErrors, v)
