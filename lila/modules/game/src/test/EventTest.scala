package lila.game

import org.scalacheck.Prop.forAll

class EventTest extends munit.ScalaCheckSuite:

  import Arbitraries.given

  test("RedirectOwner anti regression"):
    forAll: (event: Event.RedirectOwner) =>
      assertEquals(event.data.str("id"), event.id.value.some)
      assertEquals(event.data.str("url"), s"/${event.id}".some)
      assertEquals(event.data.obj("cookie"), event.cookie)
