package lila.challenge

import chess.Rated
import chess.rating.glicko.Glicko
import ligo.gorules.{ BoardSize, Ruleset, Setup as GoSetup }

import lila.rating.GoRating.Rank

// Unit 5.7: the handicap rule for a rated direct challenge (ADR 0021 §4)
final class GoRatedChallengeTest extends munit.FunSuite:

  private def perf(rank: String) =
    lila.core.perf.Perf(Glicko(Rank.fromName(rank).get.middleRating, 80, 0.06), 10, Nil, None)
  private val (k5, d1) = (perf("5k"), perf("1d"))
  private def stones(n: Int) = GoSetup(BoardSize.Nineteen, Ruleset.Japanese, if n == 0 then 6.5 else 0.5, n)

  test("a rated 5k-1d challenge may have 4 to 6 stones, and the 5k takes Black"):
    for n <- 4 to 6 do
      assertEquals(GoRatedChallenge.color(stones(n), Rated.Yes, "white", k5.some, d1.some), Right("black"))
      assertEquals(GoRatedChallenge.color(stones(n), Rated.Yes, "random", d1.some, k5.some), Right("white"))

  test("a rated challenge with stones outside the suggestion's range is refused"):
    assert(GoRatedChallenge.color(stones(3), Rated.Yes, "black", k5.some, d1.some).isLeft)
    assert(GoRatedChallenge.color(stones(7), Rated.Yes, "black", k5.some, d1.some).isLeft)
    assert(GoRatedChallenge.color(stones(2), Rated.Yes, "black", k5.some, k5.some).isLeft)

  test("a rated handicap challenge needs a named opponent"):
    assert(GoRatedChallenge.color(stones(5), Rated.Yes, "black", k5.some, none).isLeft)

  test("an even rated challenge and a casual one keep the colour asked for"):
    assertEquals(GoRatedChallenge.color(stones(0), Rated.Yes, "white", k5.some, d1.some), Right("white"))
    assertEquals(GoRatedChallenge.color(stones(0), Rated.Yes, "random", k5.some, none), Right("random"))
    assertEquals(GoRatedChallenge.color(stones(9), Rated.No, "white", k5.some, d1.some), Right("white"))
