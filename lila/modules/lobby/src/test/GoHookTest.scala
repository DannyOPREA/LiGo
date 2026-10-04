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
