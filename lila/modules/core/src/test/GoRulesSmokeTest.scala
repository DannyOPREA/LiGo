package lila.core

// LiGo unit 3.10: lila's build reaches libs/go-rules (and strategygames through it). The rules
// themselves are tested in libs/go-rules against the conformance fixtures; this only checks that the
// library loads and plays from lila's classpath. Named imports, never `ligo.gorules.*` (ADR 0019 §2).
import ligo.gorules.{ BoardSize, Captures, Color as GoColor, GoGame, Komi, Point, Refusal, Ruleset, Setup }

class GoRulesSmokeTest extends munit.FunSuite:

  private def point(sgf: String) = Point.fromSgf(sgf).getOrElse(fail(s"bad point $sgf"))

  test("a 9x9 game from lila: a capture, then a suicide refused"):
    val game =
      for
        start <- GoGame.start(
          Setup(BoardSize.Nine, Ruleset.Japanese, komi = Komi.standard(Ruleset.Japanese, 0))
        )
        g1 <- start.play(point("ba"))
        g2 <- g1.play(point("aa"))
        g3 <- g2.play(point("ab")) // takes White's corner stone
      yield g3
    val g = game.getOrElse(fail(s"refused: $game"))
    assertEquals(g.captures, Captures(black = 1, white = 0))
    assertEquals(g.stones.get(point("aa")), None)
    assertEquals(g.toMove, GoColor.White)
    // White's stone back in the corner would have no liberties and take nothing.
    assertEquals(g.play(point("aa")), Left(Refusal.Suicide))

  test("the other games' engines stay off lila's classpath (ADR 0012)"):
    List(
      "org.playstrategy.FairyStockfish",
      "com.joansala.game.oware.OwareGame",
      "com.joansala.cli.MatchCommand"
    )
      .foreach: name =>
        intercept[ClassNotFoundException](Class.forName(name))
