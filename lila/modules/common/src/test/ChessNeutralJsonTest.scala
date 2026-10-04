package lila.common

import play.api.libs.json.Json as PlayJson

import lila.common.Json.given

// The writers that replaced scalachess-play-json's (unit 3.17 part 3) keep its output.
class ChessNeutralJsonTest extends munit.FunSuite:

  test("colour as its name"):
    assertEquals(PlayJson.toJson(chess.White).toString, "\"white\"")
    assertEquals(PlayJson.toJson(chess.Black).toString, "\"black\"")

  test("centis as a bare number"):
    assertEquals(PlayJson.toJson(chess.Centis(1234)).toString, "1234")

  test("correspondence clock fields and order"):
    val c = chess.CorrespondenceClock(increment = 86400, whiteTime = 3600f, blackTime = 1800.5f)
    assertEquals(
      PlayJson.toJson(c).toString,
      """{"daysPerTurn":1,"increment":86400,"white":3600,"black":1800.5}"""
    )
