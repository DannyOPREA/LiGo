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
            val (k, v) = kv.span(_ != '=')
            k -> Seq(v.drop(1))
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

  test("no preference is JSON"):
    assertEquals(formatOf(request("/game/export/abcd1234")), Format.JSON)

  test("Accept: application/x-go-sgf asks for SGF"):
    assertEquals(formatOf(request("/game/export/abcd1234", Some("application/x-go-sgf"))), Format.SGF)

  test("?format=sgf asks for SGF"):
    assertEquals(formatOf(request("/game/export/abcd1234?format=sgf")), Format.SGF)

  test("JSON and NDJSON asked for are JSON"):
    assertEquals(formatOf(request("/game/export/abcd1234", Some("application/json"))), Format.JSON)
    assertEquals(formatOf(request("/api/games/user/x", Some("application/x-ndjson"))), Format.JSON)

  // Unit 7.5: an imported game's SGF export is the stored text, as it was sent.
  test("an imported game exports its stored SGF verbatim; other games are written from their moves"):
    val text = "(;GM[1]FF[4]SZ[9]C[note \\] with escapes];B[ee]\n(;W[cc])(;W[gg]))"
    val game = lila.game.importer.Importer.parse(text, none).fold(e => fail(e), identity)
    assertEquals(GameApiV2.storedSgf(game), Some(text))
    assertEquals(GameApiV2.storedSgf(game.copy(metadata = game.metadata.copy(sgfImport = none))), None)
