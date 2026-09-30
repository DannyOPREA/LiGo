package lila.round

import chess.{ Color, Ply }

import Takebacker.*

class TakebackerTest extends munit.FunSuite:

  test("proposed on the proposer's own turn"):
    assertEquals(
      acceptedPlies(currentPly = Ply(4), proposedAt = Ply(4), Color.Black, playedPlies = Ply(4)),
      2
    )

  test("proposed right after the proposer's move"):
    assertEquals(
      acceptedPlies(currentPly = Ply(3), proposedAt = Ply(3), Color.Black, playedPlies = Ply(3)),
      1
    )

  test("proposer moved again while the offer was pending"):
    assertEquals(
      acceptedPlies(currentPly = Ply(5), proposedAt = Ply(4), Color.Black, playedPlies = Ply(5)),
      3
    )

  test("proposer moved again while the offer was pending, black proposing"):
    assertEquals(
      acceptedPlies(currentPly = Ply(6), proposedAt = Ply(5), Color.White, playedPlies = Ply(6)),
      3
    )

  test("rewinds at most to game start"):
    assertEquals(
      acceptedPlies(currentPly = Ply(3), proposedAt = Ply(2), Color.White, playedPlies = Ply(2)),
      2
    )

  test("never rewinds further back than the game start"):
    assertEquals(
      acceptedPlies(currentPly = Ply(3), proposedAt = Ply(2), Color.Black, playedPlies = Ply(2)),
      2
    )

  test("never rewinds a non-positive number of plies"):
    assertEquals(
      acceptedPlies(currentPly = Ply(4), proposedAt = Ply(6), Color.Black, playedPlies = Ply(4)),
      1
    )

  test("from position"):
    assertEquals(
      acceptedPlies(currentPly = Ply(25), proposedAt = Ply(24), Color.Black, playedPlies = Ply(5)),
      3
    )

class GoMoveReaderTest extends munit.FunSuite:

  import lila.core.socket.protocol.RawMsg
  import RoundSocket.Protocol.In.*

  private def read(move: String) =
    RoundSocket.Protocol.In.reader(RawMsg("r/move", s"abcdefgh1234 $move + 10 20 0"))

  test("reads a Go point, a pass, and still a chess move"):
    assertEquals(
      read("pd").collect { case m: PlayerGoMove => m.action },
      Some(ligo.gorules.Action.Place(ligo.gorules.Point(15, 3)))
    )
    assertEquals(read("pass").collect { case m: PlayerGoMove => m.action }, Some(ligo.gorules.Action.Pass))
    assert(read("e2e4").exists(_.isInstanceOf[PlayerMove]))
    assertEquals(read("zz"), None)
