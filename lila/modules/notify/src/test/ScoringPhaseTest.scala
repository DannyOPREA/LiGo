package lila.notify

import reactivemongo.api.bson.*

import lila.core.LightUser
import lila.core.id.GameFullId
import lila.core.notify.NotificationContent
import lila.core.notify.NotificationContent.*

// Unit 7.6 (ADR 0023 §4): the new `ScoringPhase` content is stored and read back like `CorresAlarm`.
class ScoringPhaseTest extends munit.FunSuite:

  import BSONHandlers.given

  private val handler = summon[BSONHandler[NotificationContent]]

  test("a scoring-phase notification is stored with its type, game and opponent"):
    val doc = handler.writeTry(ScoringPhase(GameId("abcd1234"), "Opponent")).get
    assertEquals(
      doc,
      BSONDocument("gameId" -> "abcd1234", "opponent" -> "Opponent", "type" -> "scoringPhase")
    )
    assertEquals(handler.readTry(doc).get, ScoringPhase(GameId("abcd1234"), "Opponent"))

  test("a correspondence alarm is still stored the way it was"):
    val alarm = CorresAlarm(GameId("abcd1234"), "Opponent")
    assertEquals(handler.readTry(handler.writeTry(alarm).get).get, alarm)

// Unit 7.7: a game that ended with no result says so (`noResult`), and a notification stored before the
// field existed still reads back.
class GameEndNoResultTest extends munit.FunSuite:

  import BSONHandlers.given

  private val handler = summon[BSONHandler[NotificationContent]]
  private val fullId = GameFullId("abcd1234wxyz")

  test("a game that ended with no result is stored and read back with the flag"):
    val end = GameEnd(fullId, UserId("opp").some, none, true.some)
    assertEquals(handler.readTry(handler.writeTry(end).get).get, end)

  test("a game end stored before the flag existed reads back as one with a result"):
    val old =
      BSONDocument("gameId" -> fullId.value, "opponentId" -> "opp", "win" -> true, "type" -> "gameEnd")
    assertEquals(handler.readTry(old).get, GameEnd(fullId, UserId("opp").some, true.some, none))

  test("the browser is told only when there was no result"):
    val json = JSONHandlers(LightUser.GetterSync(_ => none))
    def body(end: GameEnd) =
      json.given_Writes_Notification.writes(Notification.make(UserId("me"), end)) \ "content"
    assertEquals((body(GameEnd(fullId, none, none, true.some)) \ "noResult").asOpt[Boolean], Some(true))
    assertEquals((body(GameEnd(fullId, none, none)) \ "noResult").toOption, None)
