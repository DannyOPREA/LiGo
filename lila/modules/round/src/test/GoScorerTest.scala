package lila.round

import ligo.gorules.CountVersion
import play.api.libs.json.*

// Unit 4.8 (ADR 0020 §6): the scoring phase's messages from lila-ws, as the round reads them.
class GoScorerTest extends munit.FunSuite:

  import lila.core.socket.protocol.RawMsg
  import RoundSocket.Protocol.In.*

  private def read(json: String) =
    RoundSocket.Protocol.In.reader(RawMsg("r/do", s"abcdefgh1234 $json"))

  test("score-toggle, score-accept and score-resume reach the round with their data"):
    assertEquals(
      read("""{"t":"score-toggle","d":{"p":"pd","v":"2:3"}}"""),
      Some(PlayerDo(GameFullId("abcdefgh1234"), "score-toggle", Some(Json.obj("p" -> "pd", "v" -> "2:3"))))
    )
    assertEquals(
      read("""{"t":"score-accept","d":{"v":"1:1"}}""").collect { case d: PlayerDo => d.data },
      Some(Some(Json.obj("v" -> "1:1")))
    )
    assertEquals(read("""{"t":"score-resume"}"""), Some(PlayerDo(GameFullId("abcdefgh1234"), "score-resume")))
    assertEquals(read("""{"t":"resign"}"""), Some(PlayerDo(GameFullId("abcdefgh1234"), "resign")))

  test("a count version is the phase and the request number"):
    assertEquals(GoScorer.readVersion("2:3"), Some(CountVersion(2, 3)))
    List("", "2", "2:", ":3", "a:b", "1:2:3").foreach: s =>
      assertEquals(GoScorer.readVersion(s), None, s)
