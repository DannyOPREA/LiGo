package lila.lobby

import chess.{ Clock, Rated }
import ligo.gorules.{ BoardSize, Ruleset, Setup as GoSetup }

import lila.core.game.GoSetups
import lila.core.rating.RatingRange

// Unit 3.15: hooks and seeks carry the Go setup of the game they create.
class GoHookTest extends munit.FunSuite:

  private val nine = GoSetup(BoardSize.Nine, Ruleset.Japanese, 6.5)

  private def hook(go: GoSetup, sri: String) = Hook.make(
    sri = lila.core.socket.Sri(sri),
    variant = chess.variant.Standard,
    go = go,
    clock = Clock.Config(Clock.LimitSeconds(300), Clock.IncrementSeconds(3)),
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
