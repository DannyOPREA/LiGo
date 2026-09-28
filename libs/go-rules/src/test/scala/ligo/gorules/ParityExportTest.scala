package ligo.gorules

import play.api.libs.json.*

import java.nio.file.{ Files, Path, Paths }
import scala.util.Random

// Writes what the server's engine does, for the client's engine (goban-engine, libs/board, unit 1.8)
// to replay and compare: the parity check of PLAN §6. Two parts, in target/parity/server.json:
// - `sgf`: every server fixture's game as the SGF the server writes, with the position it ends in.
//   libs/board reads each one back in goban-engine: the SGF round trip.
// - `games`: seeded random games on 9x9, 13x13 and 19x19, with the position after every action and,
//   at probed plies, the reason for every empty point the player to move may not play.
// The same data every run (fixed seeds), so a difference is a difference between the engines.
// Licence: MIT (LiGo's own code, ADR 0006).
class ParityExportTest extends munit.FunSuite:

  override val munitTimeout = scala.concurrent.duration.Duration(5, "min")

  private val out: Path = Paths.get("target", "parity", "server.json").toAbsolutePath

  private def start(s: Setup): GoGame = GoGame.start(s).fold(e => fail(e.message), identity)

  private def rows(g: GoGame): JsValue = Json.toJson(Fixtures.rowsOf(g.stones, g.size))

  private def position(g: GoGame): JsObject = Json.obj(
    "board" -> rows(g),
    "toMove" -> g.toMove.toString.toLowerCase,
    "captures" -> Json.obj("black" -> g.captures.black, "white" -> g.captures.white),
    "koPoint" -> g.koPoint.map(_.sgf),
    "phase" -> g.phase.toString.toLowerCase
  )

  /** Every empty point the player to move may not play, with the reason. */
  private def refusals(g: GoGame): JsObject =
    val legal = g.legalPoints.toSet
    val empty = for r <- 0 until g.size.lines; c <- 0 until g.size.lines yield Point(c, r)
    JsObject(
      empty
        .filterNot(p => g.stones.contains(p) || legal(p))
        .map(p =>
          p.sgf -> JsString(g.play(p).fold(_.key, _ => fail(s"${p.sgf} not in legalPoints but legal")))
        )
    )

  private def sgfCases: Seq[JsObject] =
    for
      f <- Fixtures.forServer
      ruleset <- f.rulesets
    yield
      val g = f.moves.foldLeft(start(Fixtures.setupOf(f, ruleset))): (g, t) =>
        Fixtures.applyToken(g, t).fold(r => fail(s"${f.id}: $t refused: ${r.key}"), identity)
      Json.obj(
        "id" -> f.id,
        "ruleset" -> ruleset.toString.toLowerCase,
        "komi" -> g.setup.komi,
        "sgf" -> Sgf.write(g),
        "end" -> position(g)
      )

  /** One random game: stones on random empty points, a pass now and then, and a resume whenever two passes
    * open the scoring phase, so the superko history runs across passes and resumptions (R-KO-2, R-SP-6).
    */
  private def randomGame(
      seed: Long,
      size: BoardSize,
      handicap: Int,
      maxActions: Int,
      probeEvery: Int
  ): JsObject =
    val rnd = Random(seed)
    val ruleset = if seed % 2 == 0 then Ruleset.Japanese else Ruleset.Chinese
    val first = start(Setup(size, ruleset, Komi.standard(ruleset, handicap), handicap))
    val empty = for r <- 0 until size.lines; c <- 0 until size.lines yield Point(c, r)
    var game = first
    val steps = Vector.newBuilder[JsObject]
    var n = 0
    while n < maxActions do
      val (token, next) =
        if game.phase == Phase.Scoring then "resume" -> game.resume
        else if rnd.nextInt(100) < 4 then "pass" -> game.pass
        else
          val free = empty.filterNot(game.stones.contains)
          Iterator
            .continually(free(rnd.nextInt(free.size)))
            .take(10)
            .map(p => p.sgf -> game.play(p))
            .collectFirst { case t @ (_, Right(_)) => t }
            .getOrElse("pass" -> game.pass)
      game = next.fold(r => fail(s"seed $seed: $token refused: ${r.key}"), identity)
      n += 1
      val probe = game.phase == Phase.Play && n % probeEvery == 0
      steps += Json.obj("move" -> token) ++ position(game) ++
        (if probe then Json.obj("refused" -> refusals(game)) else Json.obj())
    Json.obj(
      "seed" -> seed,
      "size" -> size.lines,
      "ruleset" -> ruleset.toString.toLowerCase,
      "komi" -> first.setup.komi,
      "handicap" -> handicap,
      "start" -> position(first),
      "steps" -> steps.result()
    )

  private def games: Seq[JsObject] =
    (1L to 60L).map(s =>
      randomGame(s, BoardSize.Nine, if s % 5 == 0 then (s % 8 + 2).toInt else 0, 160, 1)
    ) ++
      (101L to 110L).map(s => randomGame(s, BoardSize.Thirteen, 0, 250, 5)) ++
      (201L to 210L).map(s =>
        randomGame(s, BoardSize.Nineteen, if s % 3 == 0 then (s % 8 + 2).toInt else 0, 400, 20)
      )

  test("writes the server's positions for the client's parity check"):
    val sgf = sgfCases
    val gs = games
    assert(sgf.size >= 227, s"only ${sgf.size} SGF cases")
    val actions = gs.map(g => (g \ "steps").as[JsArray].value.size).sum
    assert(actions > 12000, s"only $actions random actions")
    Files.createDirectories(out.getParent)
    Files.writeString(out, Json.stringify(Json.obj("format" -> 1, "sgf" -> sgf, "games" -> gs)))
