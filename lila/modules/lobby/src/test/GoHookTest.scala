package lila.lobby

import chess.{ Clock, Rated }
import scalalib.model.Days
import ligo.gorules.{ BoardSize, Ruleset, Setup as GoSetup }

import lila.core.game.{ ClockSettings, GoSetups }
import lila.core.rating.RatingRange

// Unit 3.15: hooks and seeks carry the Go setup of the game they create.
class GoHookTest extends munit.FunSuite:

  private val nine = GoSetup(BoardSize.Nine, Ruleset.Japanese, 6.5)

  private def hook(go: GoSetup, sri: String) = Hook.make(
    sri = lila.core.socket.Sri(sri),
    variant = chess.variant.Standard,
    go = go,
    clock = ClockSettings.Fischer(Clock.Config(Clock.LimitSeconds(300), Clock.IncrementSeconds(3))),
    rated = Rated.No,
    color = TriColor.Random,
    user = none,
    sid = none,
    ratingRange = RatingRange.default,
    blocking = lila.core.pool.Blocking(Set.empty)
  )

  test("two hooks only match on the same board size, ruleset and komi"):
    assert(hook(nine, "a").compatibleWith(hook(nine, "b")))
    assert(!hook(nine, "a").compatibleWith(hook(GoSetups.default, "b")))
    assert(!hook(nine, "a").compatibleWith(hook(nine.copy(komi = 0.5), "b")))

  test("a hook shows its setup and plays in the one go perf"):
    val h = hook(nine, "a")
    assertEquals((h.render \ "go" \ "size").as[Int], 9)
    assertEquals(h.perfType, lila.rating.PerfType.Go)

  test("a seek is stored with its setup, and an older seek reads as the default"):
    import Seek.given
    import reactivemongo.api.bson.*
    val user = LobbyUser(
      UserId("u"),
      UserName("U"),
      lame = false,
      bot = false,
      perfMap = Map.empty,
      blocking = lila.core.pool.Blocking(Set.empty)
    )
    val seek = Seek(
      "abcdefgh",
      chess.variant.Standard.id,
      nine.some,
      None,
      Rated.No,
      user,
      RatingRange.default,
      nowInstant
    )
    val handler = summon[BSONDocumentHandler[Seek]]
    val doc = handler.writeTry(seek).get
    assertEquals(doc.getAsOpt[BSONDocument]("go").flatMap(_.int("sz")), Some(9))
    assertEquals(handler.readTry(doc).toOption.map(_.goSetup), Some(nine))
    assertEquals(handler.readTry(doc -- "go").toOption.map(_.goSetup), Some(GoSetups.default))
    assertEquals((seek.render \ "go" \ "size").as[Int], 9)

  // Unit 6.4 (first part): which hooks the pools may take (ADR 0022 §6)
  private def rated(go: GoSetup, color: TriColor = TriColor.Random) = Hook.make(
    sri = lila.core.socket.Sri("r"),
    variant = chess.variant.Standard,
    go = go,
    clock = ClockSettings.Fischer(Clock.Config(Clock.LimitSeconds(300), Clock.IncrementSeconds(3))),
    rated = Rated.Yes,
    color = color,
    user = none,
    sid = none,
    ratingRange = RatingRange.default,
    blocking = lila.core.pool.Blocking(Set.empty)
  )

  test("only a rated, random-colour, even, Japanese, standard-komi hook would be a pool game"):
    assert(rated(GoSetups.default).seemsCompatibleWithPools)
    assert(rated(nine).seemsCompatibleWithPools, "the board size is checked per pool")
    assert(!hook(GoSetups.default, "c").seemsCompatibleWithPools, "casual")
    assert(!rated(GoSetups.default, TriColor.Black).seemsCompatibleWithPools, "colour chosen")
    assert(!rated(GoSetups.default.copy(ruleset = Ruleset.Chinese, komi = 7.5)).seemsCompatibleWithPools)
    assert(!rated(GoSetups.default.copy(komi = 0.5)).seemsCompatibleWithPools, "komi")
    assert(!rated(GoSetups.default.copy(handicap = 2, komi = 0.5)).seemsCompatibleWithPools, "handicap")

  test("a hook goes to a pool only with that pool's clock and board size"):
    val poolClock = Clock.Config(Clock.LimitSeconds(300), Clock.IncrementSeconds(3))
    assert(rated(GoSetups.default).compatibleWithPool(poolClock, GoSetups.default))
    assert(!rated(nine).compatibleWithPool(poolClock, GoSetups.default))
    val other = Clock.Config(Clock.LimitSeconds(600), Clock.IncrementSeconds(0))
    assert(!rated(GoSetups.default).compatibleWithPool(other, GoSetups.default))
    given lila.core.pool.IsPoolCompatible =
      lila.core.pool.IsPoolCompatible((c, go) => c == poolClock && go == GoSetups.default)
    assert(rated(GoSetups.default).compatibleWithPools)
    assert(!rated(nine).compatibleWithPools)

  // Unit 5.5: a declared rank shows before the first game
  test("a player who declared 5k and has no games yet shows 5k? on their hook, not lila's default"):
    import lila.rating.GoRating
    val declared =
      lila.rating.Perf.default.copy(glicko = GoRating.startingGlicko(GoRating.Rank.fromName("5k").get))
    val perfs = lila.rating.UserPerfs.default(UserId("u")).copy(go = declared)
    val perfMap = LobbyUser.perfMapOf(perfs)
    assertEquals(perfMap.get(PerfKey.go).map(_.rating), Some(declared.intRating))
    val user =
      LobbyUser(UserId("u"), UserName("U"), false, false, perfMap, lila.core.pool.Blocking(Set.empty))
    val h = hook(nine, "d").copy(user = user.some)
    assertEquals((h.render \ "goRank").as[String], "5k?")

  // The lobby shows another player's seek once per game they seek (lila's de-duplication), and with Go the
  // board size, ruleset and komi are part of the game.
  private def seekUser(id: String) = LobbyUser(
    UserId(id),
    UserName(id),
    lame = false,
    bot = false,
    perfMap = Map.empty,
    blocking = lila.core.pool.Blocking(Set.empty)
  )

  private val bob = seekUser("bob")
  private val alice = seekUser("alice")

  private def dupSeek(id: String, go: Option[GoSetup], by: LobbyUser = bob) =
    Seek(id, chess.variant.Standard.id, go, Some(Days(3)), Rated.No, by, RatingRange.default, nowInstant)

  private def shown(seeks: List[Seek]) = SeekApi.noDupsFor(alice, seeks).map(_.id)

  test("seek list: two seeks from one player that differ only in board size both show"):
    assertEquals(shown(List(dupSeek("a", GoSetups.default.some), dupSeek("b", nine.some))), List("a", "b"))

  test("seek list: two seeks that differ only in ruleset or komi both show"):
    val chinese = GoSetups.default.copy(ruleset = Ruleset.Chinese, komi = 7.5)
    val komi = GoSetups.default.copy(komi = 0.5)
    assertEquals(
      shown(List(dupSeek("a", GoSetups.default.some), dupSeek("b", chinese.some), dupSeek("c", komi.some))),
      List("a", "b", "c")
    )

  test("seek list: the same game sought twice by one player still shows once"):
    assertEquals(shown(List(dupSeek("a", nine.some), dupSeek("b", nine.some))), List("a"))

  test("seek list: an older seek without a setup counts as the default setup"):
    assertEquals(shown(List(dupSeek("a", None), dupSeek("b", GoSetups.default.some))), List("a"))

  test("seek list: your own seeks always all show"):
    assertEquals(
      SeekApi.noDupsFor(bob, List(dupSeek("a", nine.some), dupSeek("b", nine.some))).map(_.id),
      List("a", "b")
    )

  // Unit 4.9: byo-yomi hooks
  private val byo = ClockSettings.Byoyomi(ligo.gorules.ByoyomiConfig(600, 5, 30))

  test("a byo-yomi hook shows its clock and periods, and matches only the same clock"):
    val h = hook(GoSetups.default, "y").copy(clock = byo)
    assertEquals((h.render \ "clock").as[String], "10+5×30s")
    assertEquals((h.render \ "byo" \ "periods").as[Int], 5)
    assertEquals((h.render \ "i").as[Int], 0)
    assertEquals((hook(GoSetups.default, "f").render \ "byo").toOption, None)
    assert(h.compatibleWith(hook(GoSetups.default, "z").copy(clock = byo)))
    assert(!h.compatibleWith(hook(GoSetups.default, "f")), "Fischer")

  test("byo-yomi hooks don't go to the pools, which are all Fischer for now"):
    val h = rated(GoSetups.default).copy(clock = byo)
    given lila.core.pool.IsPoolCompatible = lila.core.pool.IsPoolCompatible((_, _) => true)
    assert(!h.compatibleWithPools)
    assert(!h.compatibleWithPool(Clock.Config(Clock.LimitSeconds(600), Clock.IncrementSeconds(0)), h.go))

  // Unit 6.5: open games a player can't join are sent anyway, greyed by the browser (ADR 0022 §5)
  private def member(id: String, rating: Int, lame: Boolean = false, blocks: Set[String] = Set.empty) =
    LobbyUser(
      UserId(id),
      UserName(id),
      lame = lame,
      bot = false,
      perfMap = Map(PerfKey.go -> LobbyPerf(chess.IntRating(rating), chess.rating.RatingProvisional.No)),
      blocking = lila.core.pool.Blocking(blocks.map(UserId(_)))
    )
  private val ranged = RatingRange(chess.IntRating(1700), chess.IntRating(1900))
  private def memberHook(by: LobbyUser, range: RatingRange = RatingRange.default) =
    hook(GoSetups.default, by.id.value).copy(user = by.some, ratingRange = range)

  test("a hook out of your range, or a member's hook seen by a guest, is sent but can't be joined"):
    val carol = member("carol", 1800)
    val weak = member("weak", 1200)
    val h = memberHook(carol, ranged)
    assert(Biter.visible(h, weak.some) && !Biter.canJoin(h, weak.some), "out of range")
    assert(Biter.canJoin(h, member("near", 1750).some))
    assert(Biter.visible(h, none) && !Biter.canJoin(h, none), "guest")
    val guestHook = hook(GoSetups.default, "g")
    assert(Biter.visible(guestHook, weak.some) && !Biter.canJoin(guestHook, weak.some), "member")

  test("blocks either way and the other lame kind still hide a hook or a seek"):
    val carol = member("carol", 1800, blocks = Set("dave"))
    val dave = member("dave", 1800)
    assert(!Biter.visible(memberHook(carol), dave.some), "carol blocks dave")
    assert(!Biter.visible(memberHook(dave), carol.some), "dave is blocked by carol")
    val troll = member("troll", 1800, lame = true)
    assert(!Biter.visible(memberHook(troll), dave.some) && !Biter.visible(memberHook(troll), none))
    assert(Biter.visible(memberHook(troll), member("other", 1500, lame = true).some))
    val seek = dupSeek("s", None, by = carol).copy(ratingRange = ranged)
    assert(!Biter.visible(seek, dave))
    val weak = member("weak", 1200)
    assert(Biter.visible(seek, weak) && !Biter.canJoin(seek, weak), "a seek out of range is sent")

  test("a hook with no range of its own takes any rank: lila's chess default range is gone"):
    val h = memberHook(member("carol", 1800))
    assert(Biter.canJoin(h, member("beginner", 600).some))
    assert(Biter.canJoin(h, member("strong", 2700).some))

  test("hooks and seeks tell the browser who made them and the range they asked for"):
    val h = memberHook(member("carol", 1800), ranged)
    assertEquals((h.render \ "auth").as[Boolean], true)
    assertEquals((h.render \ "rr" \ "min").as[Int], 1700)
    assertEquals((h.render \ "rr" \ "low").asOpt[String], RatingRanges.low(ranged))
    assertEquals((hook(GoSetups.default, "g").render \ "auth").as[Boolean], false)
    assertEquals((hook(GoSetups.default, "g").render \ "rr").toOption, None)
    val seek = dupSeek("s", None).copy(ratingRange = ranged)
    assertEquals((seek.render \ "rr" \ "max").as[Int], 1900)

  test("a range's bounds carry their ranks, and a bound at lila's limit is open"):
    import chess.IntRating
    val label = (r: Int) => lila.rating.GoRating.label(IntRating(r), chess.rating.RatingProvisional.No)
    assertEquals(
      (RatingRanges.low(ranged), RatingRanges.high(ranged)),
      (Some(label(1700)), Some(label(1900)))
    )
    val upward = RatingRange(IntRating(1700), RatingRange.max)
    assertEquals((RatingRanges.low(upward), RatingRanges.high(upward)), (Some(label(1700)), None))
    val any = RatingRanges.json(RatingRange.default)
    assertEquals(((any \ "low").toOption, (any \ "high").toOption), (None, None))

  test("the correspondence tiles are 1 and 3 days of 19×19 Japanese even games"):
    assertEquals(CorresPresets.all.map(_.id), List("19x19-1d", "19x19-3d"))
    for p <- CorresPresets.all do
      assertEquals(
        (p.go.size, p.go.ruleset, p.go.komi, p.go.handicap),
        (BoardSize.Nineteen, Ruleset.Japanese, 6.5, 0)
      )
    assertEquals(CorresPresets.all.map(_.days.value), List(1, 3))
    // two players clicking the same tile get seeks that match; another board size or a handicap doesn't
    val a = dupSeek("a", CorresPresets.all.head.go.some, by = bob).copy(daysPerTurn = Some(Days(1)))
    val b = dupSeek("b", CorresPresets.all.head.go.some, by = alice).copy(daysPerTurn = Some(Days(1)))
    assert(a.compatibleWith(b))
    assert(!a.compatibleWith(b.copy(go = nine.some)))
    assert(!a.compatibleWith(b.copy(go = GoSetups.default.copy(handicap = 2, komi = 0.5).some)))
    assert(!a.compatibleWith(b.copy(daysPerTurn = Some(Days(3)))))
