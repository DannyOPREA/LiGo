package lila.puzzle

class PuzzleThemeTest extends munit.FunSuite:

  private val goKeys = List(
    "lifeAndDeath",
    "living",
    "killing",
    "ko",
    "capturingRace",
    "tesuji",
    "eyeShape",
    "snapback",
    "throwIn",
    "corner",
    "edge",
    "centre"
  )

  test("the visible themes are mix plus the twelve Go themes"):
    assertEquals(PuzzleTheme.visible.map(_.key.value).toSet, (goKeys :+ "mix").toSet)
    assertEquals(PuzzleTheme.visible.size, 13)

  test("lookup is case-insensitive and falls back to mix"):
    assertEquals(PuzzleTheme.findAny("LIFEANDDEATH").map(_.key.value), Some("lifeAndDeath"))
    assertEquals(PuzzleTheme.findOrMix("chessFork").key.value, "mix")

  test("only the themes players can judge are votable"):
    assert(PuzzleTheme.findDynamic("ko").isDefined)
    assert(PuzzleTheme.findDynamic("tesuji").isDefined)
    assert(PuzzleTheme.findDynamic("corner").isEmpty)
    assert(PuzzleTheme.findDynamic("lifeAndDeath").isEmpty)
