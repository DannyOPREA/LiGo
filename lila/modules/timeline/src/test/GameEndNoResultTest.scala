package lila.timeline

import reactivemongo.api.bson.*

import lila.core.id.GameFullId
import lila.core.timeline.GameEnd

// Unit 7.7 follow-up: a timeline entry for a game that ended with no result keeps the flag, and an entry
// stored before the flag existed still reads back (as a game with a result).
class GameEndNoResultTest extends munit.FunSuite:

  import Entry.atomBsonHandlers.gameEndHandler

  private val fullId = GameFullId("abcd1234wxyz")
  private val perf = PerfKey.go

  test("a game that ended with no result is stored and read back with the flag"):
    val end = GameEnd(fullId, UserId("opp").some, none, perf, true.some)
    assertEquals(gameEndHandler.readTry(gameEndHandler.writeTry(end).get).get, end)

  test("a game end stored before the flag existed reads back without it"):
    val old = BSONDocument("fullId" -> fullId.value, "opponent" -> "opp", "perf" -> "go")
    assertEquals(gameEndHandler.readTry(old).get, GameEnd(fullId, UserId("opp").some, none, perf))
