package lila.pool

import chess.{ Clock, IntRating }
import ligo.gorules.{ BoardSize, ByoyomiConfig, Ruleset }

import lila.core.game.{ ClockSettings, GoSetups }
import lila.core.pool.{ Blocking, PoolFrom, PoolMember }
import lila.core.socket.Sri
import lila.rating.GoRating.Rank

// Unit 6.4: the pools pair Go players and start Go games (ADR 0022 §1–§3, §6).
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

  private def fischer(min: Int, inc: Int) =
    ClockSettings.Fischer(Clock.Config(Clock.LimitSeconds(min * 60), Clock.IncrementSeconds(inc)))
  private def byo(min: Int, periods: Int, seconds: Int) =
    ClockSettings.Byoyomi(ByoyomiConfig(min * 60, periods, seconds))

  // Unit 6.4 (second part): ADR 0022 §1's pool list
  test("the pools are ADR 0022's seven, with its ids, in ADR 0005's tile order"):
    assertEquals(
      PoolList.all.map(_.id.value),
      List(
        "9x9-1m-5x10s",
        "9x9-3m-3x20s",
        "9x9-3m-2s",
        "19x19-5m-5x10s",
        "19x19-10m-5x30s",
        "19x19-20m-5x30s",
        "19x19-10m-10s"
      )
    )
    assertEquals(
      PoolList.all.map(_.clock.show),
      List("1+5×10s", "3+3×20s", "3+2", "5+5×10s", "10+5×30s", "20+5×30s", "10+10")
    )
    assertEquals(PoolList.all.map(_.id).distinct.size, 7)

  test("every pool plays Go: its board size, Japanese rules, standard komi, even, in the Go perf"):
    PoolList.all.foreach: p =>
      assertEquals(p.go, GoSetups.default.copy(size = p.size))
      assertEquals(p.go.ruleset, Ruleset.Japanese)
      assertEquals(p.go.handicap, 0)
      assertEquals(p.go.komi, 6.5)
      assertEquals(p.perfKey, PerfKey.go)
    assertEquals(PoolList.all.map(_.size.lines), List(9, 9, 9, 19, 19, 19, 19))

  test("every pool runs a wave every 5 seconds"):
    PoolList.all.foreach: p =>
      assertEquals(p.wave.every, 5.seconds)

  test("a pool is found by its clock, Fischer or byo-yomi, and its Go setup"):
    val nine = GoSetups.default.copy(size = BoardSize.Nine)
    assertEquals(PoolList.find(fischer(3, 2), nine).map(_.id.value), Some("9x9-3m-2s"))
    assertEquals(PoolList.find(byo(10, 5, 30), GoSetups.default).map(_.id.value), Some("19x19-10m-5x30s"))
    assertEquals(PoolList.find(fischer(3, 2), GoSetups.default), None, "3+2 is a 9×9 pool")
    assertEquals(PoolList.find(byo(10, 5, 20), GoSetups.default), None, "other period length")
    assertEquals(PoolList.find(fischer(10, 10), GoSetups.default.copy(ruleset = Ruleset.Chinese)), None)
    assertEquals(PoolList.find(fischer(10, 10), GoSetups.default.copy(handicap = 2, komi = 0.5)), None)
    assert(PoolList.isPoolCompatible.exec(byo(1, 5, 10), nine))
    assert(!PoolList.isPoolCompatible.exec(byo(1, 5, 10), GoSetups.default))

  test("the lobby page gets each pool's id, size, clock, speed and clock settings"):
    val json = PoolList.json
    assertEquals((json(0) \ "id").as[String], "9x9-1m-5x10s")
    assertEquals((json(0) \ "size").as[Int], 9)
    assertEquals((json(0) \ "clock").as[String], "1+5×10s")
    assertEquals((json(0) \ "byo" \ "periods").as[Int], 5)
    assertEquals((json(0) \ "byo" \ "period").as[Int], 10)
    assertEquals((json(0) \ "byo" \ "limit").as[Int], 60)
    assertEquals((json(0) \ "lim").toOption, None)
    assertEquals((json(2) \ "lim").as[Int], 3)
    assertEquals((json(2) \ "inc").as[Int], 2)
    assertEquals((json(2) \ "byo").toOption, None)
    assertEquals((json(6) \ "speed").as[String], "rapid")

  test("a pool game gets the pair's stones with the spec's komi, and starts"):
    val pool = PoolList.all.find(_.id.value == "19x19-10m-5x30s").get
    assertEquals(GameStarter.setupFor(pool, 0), pool.go)
    val four = GameStarter.setupFor(pool, 4)
    assertEquals((four.handicap, four.komi, four.size), (4, 0.5, BoardSize.Nineteen))
    val one = GameStarter.setupFor(pool, 1)
    assertEquals((one.handicap, one.komi), (1, 0.5))
    for n <- 0 to 9 do assert(ligo.gorules.GoGame.start(GameStarter.setupFor(pool, n)).isRight, s"$n stones")
    val nine = PoolList.all.head
    for n <- 0 to 4 do assert(ligo.gorules.GoGame.start(GameStarter.setupFor(nine, n)).isRight, s"9×9, $n")

  test("two players of the same rank are paired, and the pair gets no stones"):
    val a = member("a", Rank.Kyu(5))
    val b = member("b", Rank.Kyu(5))
    assertEquals(pairedIds(Vector(a, b)), Set("a-b"))

  test("a 5k and a 1d who want even games are too far apart for the first waves"):
    assertEquals(pairedIds(Vector(member("k5", Rank.Kyu(5)), member("d1", Rank.Dan(1)))), Set.empty)

  // Unit 6.4 (second part): the Handicap OK chip (ADR 0022 §2–§3)
  private def handicap(m: PoolMember, rankKnown: Boolean = true) =
    m.copy(handicapOk = true, rankKnown = rankKnown)

  test("a 5k and a 1d who both said Handicap OK meet at once, with 5 stones, the 5k taking Black"):
    val pairs =
      MatchMaking(Vector(handicap(member("k5", Rank.Kyu(5))), handicap(member("d1", Rank.Dan(1)))), 19)
    assertEquals(pairs.size, 1)
    assertEquals(pairs.head.stones, 5)
    assertEquals(pairs.head.black, Some(UserId("k5")))

  test("one Even only player is enough for an even game"):
    val k5 = handicap(member("k5", Rank.Kyu(5)))
    val d1 = member("d1", Rank.Dan(1)).copy(rankKnown = true)
    assertEquals(MatchMaking(Vector(k5, d1), 19), Vector.empty)
    val same = MatchMaking(Vector(k5, handicap(member("k5b", Rank.Kyu(5)))), 19)
    assertEquals(same.map(c => (c.stones, c.black)), Vector((0, None)))

  test("an account with no rank yet gets no stones, even with Handicap OK"):
    val k5 = handicap(member("k5", Rank.Kyu(5)))
    val unranked = handicap(member("new", Rank.Dan(1)), rankKnown = false)
    assertEquals(MatchMaking(Vector(k5, unranked), 19), Vector.empty)

  test("on 9×9 a 5k and a 1d both saying Handicap OK get 1 stone (six ranks a stone)"):
    val pairs =
      MatchMaking(Vector(handicap(member("k5", Rank.Kyu(5))), handicap(member("d1", Rank.Dan(1)))), 9)
    assertEquals(pairs.map(c => (c.stones, c.black)), Vector((1, Some(UserId("k5")))))

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
