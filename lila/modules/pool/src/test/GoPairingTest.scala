package lila.pool

import chess.IntRating

import lila.core.pool.{ Blocking, PoolFrom, PoolMember }
import lila.core.rating.RatingRange
import lila.core.socket.Sri
import lila.rating.GoRating.Rank

import GoPairing.*

class GoPairingTest extends munit.FunSuite:

  private def member(
      id: String,
      rank: Rank,
      handicapOk: Boolean = true,
      rankKnown: Boolean = true,
      misses: Int = 0,
      range: Option[RatingRange] = None
  ) =
    Member(
      PoolMember(
        userId = UserId(id),
        sri = Sri(id),
        from = PoolFrom.Socket,
        rating = IntRating(rank.middleRating.round.toInt),
        provisional = false,
        ratingRange = range,
        lame = false,
        blocking = Blocking(Set.empty),
        misses = misses
      ),
      handicapOk = handicapOk,
      rankKnown = rankKnown
    )

  private val k5 = member("k5", Rank.Kyu(5))
  private val d1 = member("d1", Rank.Dan(1))

  // lila's own score cap for two ratings, the limit `gap` is held to
  private def cap(a: Member, b: Member) =
    MatchMaking.wmMatching.ratingToMaxScore(a.pool.rating.atMost(b.pool.rating))

  test("a 5k and a 1d who both allow handicap get 5 stones on 19×19, the 5k taking Black"):
    assertEquals(stones(k5, d1, 19), 5)
    assertEquals(stones(d1, k5, 19), 5)
    assertEquals(black(k5, d1, 19), Some(UserId("k5")))
    assertEquals(black(d1, k5, 19), Some(UserId("k5")))

  test("the same pair is too far apart for an even game, and fine with handicap"):
    val even = gap(k5.copy(handicapOk = false), d1, 19)
    // 5k's middle is 1580, 1d's 1960 (GoRating's curve)
    assertEquals((k5.rating, d1.rating), (1580d, 1960d))
    assertEquals(even, 380)
    assert(even > cap(k5, d1), s"even gap $even should pass lila's cap ${cap(k5, d1)}")
    val hc = gap(k5, d1, 19)
    // the stones cover the whole gap: 5 × 15 for the stones, plus 1 point because ratings are
    // whole numbers and rank middles aren't
    assertEquals(hc, 76)
    assert(hc <= cap(k5, d1), s"handicap gap $hc should fit lila's cap ${cap(k5, d1)}")

  test("one player saying Even only makes the game even"):
    assertEquals(stones(k5.copy(handicapOk = false), d1, 19), 0)
    assertEquals(stones(k5, d1.copy(handicapOk = false), 19), 0)
    assertEquals(black(k5.copy(handicapOk = false), d1, 19), None)

  test("an account with no rank yet gets an even game against anyone (ADR 0021 §4)"):
    assertEquals(stones(k5.copy(rankKnown = false), d1, 19), 0)
    assertEquals(stones(k5, d1.copy(rankKnown = false), 19), 0)

  test("two players of the same rank play even, and that beats a one-stone pair"):
    val k5b = member("k5b", Rank.Kyu(5))
    assertEquals(stones(k5, k5b, 19), 0)
    assertEquals(gap(k5, k5b, 19), 0)
    val k4 = member("k4", Rank.Kyu(4))
    assertEquals(stones(k5, k4, 19), 1)
    assert(gap(k5, k5b, 19) < gap(k5, k4, 19))

  test("a one-rank gap: one stone (the no-komi game) scores better than an even game"):
    val k4 = member("k4", Rank.Kyu(4))
    assertEquals(stones(k5, k4, 19), 1)
    assert((scorePerStone to scorePerStone + 1).contains(gap(k5, k4, 19)), s"${gap(k5, k4, 19)}")
    assert(gap(k5, k4, 19) < gap(k5.copy(handicapOk = false), k4, 19))

  test("on 9×9 a stone is worth six ranks: 5k vs 1d gets 1 stone, the rank left over counts"):
    assertEquals(stones(k5, d1, 9), 1)
    // one stone covers 6 ranks, one more than the gap: a rank up from 1580 is 71 points, plus 15
    assertEquals(gap(k5, d1, 9), 86)
    assert(gap(k5, d1, 9) < gap(k5.copy(handicapOk = false), d1, 9))

  test("above the stone cap the rest of the gap counts, so lila's cap still refuses the pair"):
    val k20 = member("k20", Rank.Kyu(20))
    val d5 = member("d5", Rank.Dan(5))
    assertEquals(stones(k20, d5, 19), 9)
    assert(gap(k20, d5, 19) > cap(k20, d5), s"${gap(k20, d5, 19)} vs ${cap(k20, d5)}")
    val k25 = member("k25", Rank.Kyu(25))
    val d9 = member("d9", Rank.Dan(9))
    assertEquals(stones(k25, d9, 9), 4)
    assert(gap(k25, d9, 9) > cap(k25, d9))

  test("a board size without server games gets an even game"):
    assertEquals(stones(k5, d1, 13), 0)
    assertEquals(gap(k5, d1, 13), (d1.rating - k5.rating).abs.round.toInt)

  test("while waiting, Even only reaches the ranks next to yours and no stones"):
    val Some(range) = waitingRange(k5.copy(handicapOk = false), 19): @unchecked
    assertEquals(range.maxStones, 0)
    assert(range.weakest.lowerRank < Rank.Kyu(5).lowerRank)
    assert(range.strongest.lowerRank > Rank.Kyu(5).lowerRank)
    assert(range.strongest.lowerRank < Rank.Dan(1).lowerRank)

  test("while waiting, Handicap OK reaches further, with stones"):
    val Some(even) = waitingRange(k5.copy(handicapOk = false), 19): @unchecked
    val Some(hc) = waitingRange(k5, 19): @unchecked
    assert(hc.maxStones > 0)
    assert(hc.weakest.lowerRank < even.weakest.lowerRank)
    assert(hc.strongest.lowerRank > even.strongest.lowerRank)

  test("the range widens with every missed wave and stops at lila's miss-bonus ceiling"):
    val ranges = List(0, 5, 20, 100).map(m =>
      waitingRange(member("w", Rank.Kyu(5), handicapOk = false, misses = m), 19).get
    )
    ranges
      .zip(ranges.tail)
      .foreach: (a, b) =>
        assert(b.weakest.lowerRank <= a.weakest.lowerRank)
        assert(b.strongest.lowerRank >= a.strongest.lowerRank)
    assert(ranges.last.strongest.lowerRank > ranges.head.strongest.lowerRank)
    // the miss bonus stops at 400 points (80 waves at 5 points), so 100 and 1,000 missed waves reach as far
    assertEquals(
      waitingRange(member("w", Rank.Kyu(5), handicapOk = false, misses = 1000), 19).get,
      ranges.last
    )

  test("lila's pair score allows the 5k and the 1d with handicap and refuses them even"):
    assert(pairScore(k5, d1, 19).isDefined)
    assertEquals(pairScore(k5.copy(handicapOk = false), d1, 19), None)

  test("a player's own range setting still refuses a partner that handicap would cover"):
    val narrow = RatingRange(IntRating(k5.pool.rating.value - 100), IntRating(k5.pool.rating.value + 100))
    val k5r = member("k5r", Rank.Kyu(5), range = Some(narrow))
    assertEquals(pairScore(k5r, d1, 19), None)
    assertEquals(pairScore(d1, k5r, 19), None)

  test("a player never pairs with themselves or someone they block"):
    assertEquals(pairScore(k5, k5, 19), None)
    val blocker = Member(k5.pool.copy(blocking = Blocking(Set(UserId("d1")))), true, true)
    assertEquals(pairScore(blocker, d1, 19), None)

  test("a 5k waiting with Handicap OK can meet 13k to 4d in the first wave, up to 8 stones"):
    // ADR 0022 §3: 15 points a stone against lila's cap plus the good-sit-counter bonus
    val Some(range) = waitingRange(k5, 19): @unchecked
    assertEquals(range, WaitingRange(Rank.Kyu(13), Rank.Dan(4), 8))

  test("the waiting range stays inside the member's own range setting"):
    val narrow = RatingRange(IntRating(k5.pool.rating.value - 100), IntRating(k5.pool.rating.value + 100))
    val Some(range) = waitingRange(member("k5r", Rank.Kyu(5), range = Some(narrow)), 19): @unchecked
    assert(range.weakest.lowerRank >= Rank.Kyu(7).lowerRank, s"$range")
    assert(range.strongest.lowerRank <= Rank.Kyu(4).lowerRank, s"$range")
    assertEquals(range.maxStones, 1)

  test("the miss bonus grows at lila's rate per second: 5 points per 5 s wave, up to lila's ceiling"):
    val m = k5.pool
    assertEquals(missBonus(m.copy(misses = 0)), 0)
    assertEquals(missBonus(m.copy(misses = 12)), 60)
    // lila's ceiling is 460 + 20 × min(sit counter, −3): 400 for a player with a good sit counter
    assertEquals(missBonus(m.copy(misses = 80)), 400)
    assertEquals(missBonus(m.copy(misses = 500)), 400)
    // and lower for players who often leave games they are losing
    assertEquals(missBonus(m.copy(misses = 500, rageSitCounter = -10)), 460 - 200)

  test("on 9×9 the tile shows only the unbroken run of ranks around your own, plus the stones"):
    // a stone covers six ranks, so a 5k can also meet 1d–3d with one stone and weaker or
    // stronger players with more, but not 3k–1k: the tile must not claim one span
    val Some(range) = waitingRange(k5, 9): @unchecked
    assertEquals(range, WaitingRange(Rank.Kyu(6), Rank.Kyu(4), 3))
    val k2 = member("k2", Rank.Kyu(2))
    assertEquals(pairScore(k5, k2, 9), None)
    assertEquals(stones(k5, member("d2", Rank.Dan(2)), 9), 1)
    assert(pairScore(k5, member("d2", Rank.Dan(2)), 9).isDefined)

  test("on 9×9 the weaker player takes Black whichever order the pair comes in"):
    val k20 = member("k20", Rank.Kyu(20))
    assertEquals(black(k5, k20, 9), Some(UserId("k20")))
    assertEquals(black(k20, k5, 9), Some(UserId("k20")))

  test("an account with no rank yet waits for even games only"):
    val Some(range) = waitingRange(k5.copy(rankKnown = false), 19): @unchecked
    assertEquals(range.maxStones, 0)
    assertEquals(range, waitingRange(k5.copy(handicapOk = false), 19).get)

  test("a bad sit counter only lowers how far the range can widen; provisional changes nothing"):
    def at(misses: Int, sit: Int, provisional: Boolean = false) =
      waitingRange(
        Member(k5.pool.copy(misses = misses, rageSitCounter = sit, provisional = provisional), true, true),
        19
      ).get
    // the typical opponent has the same sit counter, so lila's +30 applies as for good players
    assertEquals(at(0, -10), at(0, 0))
    // but lila's miss-bonus ceiling is 260 points instead of 400 for them
    assert(at(100, -10).weakest.lowerRank > at(100, 0).weakest.lowerRank, s"${at(100, -10)} vs ${at(100, 0)}")
    // the typical opponent isn't provisional, so lila's provisional bonus never applies
    assertEquals(at(0, 0, provisional = true), at(0, 0))

  test("for an even pair the score is exactly lila's, before any wave is missed"):
    val pairs = List(
      k5 -> member("k4", Rank.Kyu(4)),
      k5 -> member("k6", Rank.Kyu(6)),
      k5 -> d1,
      member("k15", Rank.Kyu(15)) -> member("k14", Rank.Kyu(14)),
      member("d3", Rank.Dan(3)) -> member("d4", Rank.Dan(4))
    )
    pairs.foreach: (a, b) =>
      val even = a.copy(handicapOk = false)
      assertEquals(pairScore(even, b, 19), MatchMaking.wmMatching.pairScore(a.pool, b.pool), s"$a $b")
