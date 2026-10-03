package lila.history

import chess.IntRating
import reactivemongo.api.bson.*

// Unit 5.6: the go perf's rating history is stored and read back for the profile's graph
class GoHistoryTest extends munit.FunSuite:

  import History.given

  test("a stored go history reads back as the go perf's points, in day order"):
    val doc =
      BSONDocument("go" -> BSONDocument("12" -> 1620, "3" -> 1580), "puzzle" -> BSONDocument("1" -> 1500))
    val history = summon[BSONDocumentReader[History]].readTry(doc).get
    assertEquals(history(PerfKey.go), List(3 -> IntRating(1580), 12 -> IntRating(1620)))
    assertEquals(history(PerfKey.puzzle), List(1 -> IntRating(1500)))

  test("a player with no Go games yet has an empty go history"):
    val history = summon[BSONDocumentReader[History]].readTry(BSONDocument()).get
    assertEquals(history(PerfKey.go), Nil)
