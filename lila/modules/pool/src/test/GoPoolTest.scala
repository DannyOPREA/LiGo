package lila.pool

import chess.{ Clock, IntRating }
import ligo.gorules.{ BoardSize, Ruleset }

import lila.core.game.GoSetups
import lila.core.pool.{ Blocking, PoolFrom, PoolMember }
import lila.core.socket.Sri
import lila.rating.GoRating.Rank

// Unit 6.4 (first part): the pools pair Go players and start Go games (ADR 0022 §1, §3, §6).
class GoPoolTest extends munit.FunSuite:

  private def member(id: String, rank: Rank, misses: Int = 0) = PoolMember(
    userId = UserId(id),
    sri = Sri(id),
    from = PoolFrom.Socket,
    rating = IntRating(rank.middleRating.round.toInt),
    provisional = false,
    ratingRange = None,
    lame = false,
    blocking = Blocking(Set.empty),
    misses = misses
  )

  private def pairedIds(members: Vector[PoolMember], size: Int = 19) =
    MatchMaking(members, size).map(_.userIds.map(_.value).sorted.mkString("-")).toSet

  test("every pool plays Go: 19×19, Japanese rules, standard komi, even, in the Go perf"):
    PoolList.all.foreach: p =>
      assertEquals(p.go, GoSetups.default)
      assertEquals(p.go.ruleset, Ruleset.Japanese)
      assertEquals(p.go.handicap, 0)
      assertEquals(p.perfKey, PerfKey.go)

  test("every pool runs a wave every 5 seconds"):
    PoolList.all.foreach: p =>
      assertEquals(p.wave.every, 5.seconds)

  test("a pool is found by its clock and its Go setup, not the clock alone"):
    val clock = Clock.Config(Clock.LimitSeconds(300), Clock.IncrementSeconds(3))
    assert(PoolList.find(clock, GoSetups.default).isDefined)
    assertEquals(PoolList.find(clock, GoSetups.default.copy(size = BoardSize.Nine)), None)
    assertEquals(PoolList.find(clock, GoSetups.default.copy(ruleset = Ruleset.Chinese)), None)
    assertEquals(PoolList.find(clock, GoSetups.default.copy(handicap = 2, komi = 0.5)), None)
    assert(PoolList.isPoolCompatible.exec(clock, GoSetups.default))
    assert(!PoolList.isPoolCompatible.exec(clock, GoSetups.default.copy(size = BoardSize.Nine)))

  test("two players of the same rank are paired, and the pair gets no stones"):
    val a = member("a", Rank.Kyu(5))
    val b = member("b", Rank.Kyu(5))
    assertEquals(pairedIds(Vector(a, b)), Set("a-b"))

  test("a 5k and a 1d are too far apart for the first waves, since pool games are even for now"):
    assertEquals(pairedIds(Vector(member("k5", Rank.Kyu(5)), member("d1", Rank.Dan(1)))), Set.empty)

  test("with several waiting, the closest ranks are paired together"):
    val members = Vector(
      member("k5", Rank.Kyu(5)),
      member("d2", Rank.Dan(2)),
      member("k4", Rank.Kyu(4)),
      member("d3", Rank.Dan(3))
    )
    assertEquals(pairedIds(members), Set("k4-k5", "d2-d3"))

  test("waiting widens the reach by 5 points per 5-second wave, lila's rate per second"):
    val k5 = member("k5", Rank.Kyu(5))
    val k3 = member("k3", Rank.Kyu(3))
    // 5k (1580) and 3k are over lila's cap at first
    assertEquals(pairedIds(Vector(k5, k3)), Set.empty)
    val waves = (1 to 80).find(m => pairedIds(Vector(k5.copy(misses = m), k3.copy(misses = m))).nonEmpty)
    // they meet at the first wave where rating gap − 5 × waves − lila's 30-point good-sit bonus fits
    // lila's cap at 1580 (105)
    val gap = (k3.rating.value - k5.rating.value).abs
    val cap = MatchMaking.wmMatching.ratingToMaxScore(k5.rating)
    assertEquals(cap, 105)
    val expected = math.ceil((gap - 30 - cap) / 5.0).toInt
    assert(expected > 1, s"gap $gap")
    assertEquals(waves, Some(expected))
