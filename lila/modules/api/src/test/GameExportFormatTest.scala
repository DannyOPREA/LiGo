package lila.api

import play.api.libs.typedmap.TypedMap
import play.api.mvc.request.{ RemoteConnection, RequestFactory, RequestTarget }
import play.api.mvc.{ AnyContentAsEmpty, Headers, RequestHeader }

import lila.api.GameApiV2.Format

// Unit 4.11: how an export request picks PGN, JSON or SGF.
class GameExportFormatTest extends munit.FunSuite:

  private def request(uri: String, accept: Option[String] = None): RequestHeader =
    RequestFactory.plain.createRequest(
      RemoteConnection("127.0.0.1", secure = false, None),
      "GET",
      RequestTarget(
        uri,
        uri.takeWhile(_ != '?'),
        uri
          .dropWhile(_ != '?')
          .drop(1)
          .split('&')
          .toList
          .filter(_.contains('='))
          .map { kv =>
            val Array(k, v) = kv.split('=')
            k -> Seq(v)
          }
          .toMap
      ),
      "HTTP/1.1",
      Headers(accept.toList.map("Accept" -> _)*),
      TypedMap.empty,
      AnyContentAsEmpty
    )

  private def formatOf(req: RequestHeader): Format =
    given RequestHeader = req
    Format.byRequest

  test("no preference is PGN (the controller turns a Go game's into SGF)"):
    assertEquals(formatOf(request("/game/export/abcd1234")), Format.PGN)

  test("Accept: application/x-go-sgf asks for SGF"):
    assertEquals(formatOf(request("/game/export/abcd1234", Some("application/x-go-sgf"))), Format.SGF)

  test("?format=sgf asks for SGF"):
    assertEquals(formatOf(request("/game/export/abcd1234?format=sgf")), Format.SGF)

  test("JSON and NDJSON still win when asked for"):
    assertEquals(formatOf(request("/game/export/abcd1234", Some("application/json"))), Format.JSON)
    assertEquals(formatOf(request("/api/games/user/x", Some("application/x-ndjson"))), Format.JSON)
