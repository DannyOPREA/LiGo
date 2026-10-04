package lila.notify

import reactivemongo.api.bson.*

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
