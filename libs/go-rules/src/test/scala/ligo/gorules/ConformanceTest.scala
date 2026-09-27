package ligo.gorules

import play.api.libs.json.*

// Replays every conformance fixture that applies to the server (libs/conformance/README.md,
// "Engine harnesses"): set up, play the moves (each must be accepted), then check each `expect`
// field. A case without a ruleset runs under both. The server never has a known gap (spec §9).
// Licence: MIT (LiGo's own code, ADR 0006).
class ConformanceTest extends munit.FunSuite:

  private val cases = Fixtures.forServer

  test("finds the server's fixtures"):
    assert(cases.size >= 115, s"only ${cases.size} server cases in ${Fixtures.dir}")
    assertEquals(cases.map(_.id).distinct.size, cases.size)

  for
    f <- cases
    ruleset <- f.rulesets
  do
    test(s"${f.id} (${ruleset.toString.toLowerCase}): ${f.title}"):
      assert(!f.knownGaps.exists(_.keys.contains("server")), "the server is the referee: no known gaps")
      val start = GoGame.start(Fixtures.setupOf(f, ruleset)).fold(e => fail(e.message), identity)
      val game = f.moves.zipWithIndex.foldLeft(start): (game, move) =>
        Fixtures
          .applyToken(game, move._1)
          .fold(r => fail(s"move ${move._2 + 1} (${move._1}) refused: ${r.key}"), identity)
      check(f, game)

  private def check(f: FixtureCase, game: GoGame): Unit =
    val e = f.expect
    (e \ "board")
      .asOpt[List[String]]
      .foreach: rows =>
        assertEquals(Fixtures.rowsOf(game.stones, game.size).mkString("\n"), rows.mkString("\n"), "board")
    (e \ "toMove").asOpt[String].foreach(c => assertEquals(game.toMove, Fixtures.color(c), "toMove"))
    (e \ "captures")
      .asOpt[JsObject]
      .foreach: c =>
        assertEquals(game.captures, Captures((c \ "black").as[Int], (c \ "white").as[Int]), "captures")
    (e \ "koPoint").toOption.foreach: ko =>
      assertEquals(game.koPoint.map(_.sgf), ko.asOpt[String], "koPoint")
    (e \ "phase")
      .asOpt[String]
      .foreach: p =>
        assertEquals(game.phase.toString.toLowerCase, p, "phase")
    (e \ "legal")
      .asOpt[List[String]]
      .foreach: moves =>
        moves.foreach: m =>
          Fixtures.applyToken(game, m).left.foreach(r => fail(s"$m should be legal, refused: ${r.key}"))
    (e \ "illegal")
      .asOpt[List[JsObject]]
      .foreach: moves =>
        moves.foreach: i =>
          val m = (i \ "move").as[String]
          Fixtures.applyToken(game, m) match
            case Right(_) => fail(s"$m should be illegal (${(i \ "reason").as[String]}), was accepted")
            case Left(r) => assertEquals(r.key, (i \ "reason").as[String], s"reason $m is refused")
