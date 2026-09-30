package lila.web

import play.api.libs.json.{ JsObject, JsValue, Json }

import java.nio.file.{ Files, Paths }

// The installable app's manifest (unit 9.6, ADR 0026 §1) is the copy the browser test installs from
// (ui/playground/e2e/manifest.json), so a change to one without the other fails here.
class StaticContentTest extends munit.FunSuite:

  // sbt runs tests from lila/, or from the module's own folder when forked.
  val copy = List("ui/playground/e2e/manifest.json", "../../ui/playground/e2e/manifest.json")
    .map(Paths.get(_))
    .find(Files.exists(_))
    .getOrElse(fail("ui/playground/e2e/manifest.json not found"))

  test("manifest matches the browser test's copy"):
    assertEquals(StaticContent.manifest("localhost:8080"): JsValue, Json.parse(Files.readString(copy)))

  test("manifest has no store apps and a maskable icon"):
    val m = StaticContent.manifest("assets.example")
    assert((m \ "related_applications").toOption.isEmpty)
    assert(
      (m \ "icons")
        .as[List[JsObject]]
        .exists(i => (i \ "purpose").as[String] == "maskable")
    )
