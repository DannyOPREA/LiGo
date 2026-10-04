package lila.lobby

import chess.Rated
import scalalib.model.Days
import ligo.gorules.{ BoardSize, Ruleset, Setup as GoSetup }

import lila.core.game.GoSetups
import lila.core.rating.RatingRange

// The lobby shows another player's seek once per game they seek (lila's de-duplication), and with Go the
// board size, ruleset and komi are part of the game.
class SeekApiTest extends munit.FunSuite:

  private def user(id: String) = LobbyUser(
    UserId(id),
    UserName(id),
    lame = false,
    bot = false,
    perfMap = Map.empty,
    blocking = lila.core.pool.Blocking(Set.empty)
  )

  private val bob = user("bob")
  private val alice = user("alice")

  private def seek(id: String, go: Option[GoSetup], by: LobbyUser = bob) =
    Seek(id, chess.variant.Standard.id, go, Some(Days(3)), Rated.No, by, RatingRange.default, nowInstant)

  private val nine = GoSetup(BoardSize.Nine, Ruleset.Japanese, 6.5)

  private def shown(seeks: List[Seek]) = SeekApi.noDupsFor(alice, seeks).map(_.id)

  test("two seeks from one player that differ only in board size both show"):
    assertEquals(shown(List(seek("a", GoSetups.default.some), seek("b", nine.some))), List("a", "b"))

  test("two seeks that differ only in ruleset or komi both show"):
    val chinese = GoSetups.default.copy(ruleset = Ruleset.Chinese, komi = 7.5)
    val komi = GoSetups.default.copy(komi = 0.5)
    assertEquals(
      shown(List(seek("a", GoSetups.default.some), seek("b", chinese.some), seek("c", komi.some))),
      List("a", "b", "c")
    )

  test("the same game sought twice by one player still shows once"):
    assertEquals(shown(List(seek("a", nine.some), seek("b", nine.some))), List("a"))

  test("an older seek without a setup counts as the default setup"):
    assertEquals(shown(List(seek("a", None), seek("b", GoSetups.default.some))), List("a"))

  test("your own seeks always all show"):
    assertEquals(
      SeekApi.noDupsFor(bob, List(seek("a", nine.some), seek("b", nine.some))).map(_.id),
      List("a", "b")
    )
