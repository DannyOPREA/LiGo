package lila.game

import chess.Status

// Unit 5.4: which games end a player's chance to change their declared Go rank (ADR 0021 §2)
class GotGoingTest extends munit.FunSuite:

  test("a game that started and wasn't aborted or abandoned before its first move got going"):
    List(Status.Started, Status.Resign, Status.Outoftime, Status.Timeout, Status.UnknownFinish, Status.Draw)
      .foreach: s =>
        assert(Query.gotGoing(s), s.toString)

  test("a game that was only created, aborted, or abandoned before its first move didn't"):
    List(Status.Created, Status.Aborted, Status.NoStart).foreach: s =>
      assert(!Query.gotGoing(s), s.toString)

  test("the Mongo query lists exactly the statuses that got going"):
    val ids =
      Query.gotGoing.getAsOpt[reactivemongo.api.bson.BSONDocument]("s").flatMap(_.getAsOpt[List[Int]]("$in"))
    assertEquals(ids.map(_.toSet), Some(Status.all.filter(Query.gotGoing).map(_.id).toSet))
    assert(!ids.exists(_.contains(Status.NoStart.id)))
