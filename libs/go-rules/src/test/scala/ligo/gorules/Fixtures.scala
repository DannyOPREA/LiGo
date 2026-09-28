package ligo.gorules

import play.api.libs.json.*

import java.nio.file.{ Files, Path, Paths }
import scala.jdk.CollectionConverters.*

// Reads the shared conformance fixtures (libs/conformance/README.md, "The format").
// Licence: MIT (LiGo's own code, ADR 0006).

final case class FixtureCase(
    file: String,
    id: String,
    title: String,
    appliesTo: List[String],
    size: Int,
    ruleset: Option[String],
    handicap: Int,
    komi: Option[Double],
    setup: Option[JsObject],
    moves: List[String],
    expect: JsObject,
    knownGaps: Option[JsObject]
):
  def rulesets: List[Ruleset] = ruleset match
    case Some("japanese") => List(Ruleset.Japanese)
    case Some("chinese") => List(Ruleset.Chinese)
    case Some(other) => sys.error(s"$id: unknown ruleset $other")
    case None => Ruleset.values.toList

object Fixtures:

  val dir: Path = Paths.get("..", "conformance", "fixtures").toAbsolutePath.normalize

  def all: List[FixtureCase] =
    Files
      .list(dir)
      .iterator
      .asScala
      .filter(_.toString.endsWith(".json"))
      .toList
      .sortBy(_.getFileName.toString)
      .flatMap(read)

  def forServer: List[FixtureCase] = all.filter(_.appliesTo.contains("server"))

  private def read(path: Path): List[FixtureCase] =
    val json = Json.parse(Files.readString(path))
    (json \ "cases")
      .as[List[JsObject]]
      .map: c =>
        FixtureCase(
          file = path.getFileName.toString,
          id = (c \ "id").as[String],
          title = (c \ "title").as[String],
          appliesTo = (c \ "appliesTo").as[List[String]],
          size = (c \ "size").as[Int],
          ruleset = (c \ "ruleset").asOpt[String],
          handicap = (c \ "handicap").asOpt[Int].getOrElse(0),
          komi = (c \ "komi").asOpt[Double],
          setup = (c \ "setup").asOpt[JsObject],
          moves = (c \ "moves").as[List[String]],
          expect = (c \ "expect").asOpt[JsObject].getOrElse(Json.obj()),
          knownGaps = (c \ "knownGaps").asOpt[JsObject]
        )

  def color(s: String): Color = s match
    case "black" => Color.Black
    case "white" => Color.White
    case other => sys.error(s"unknown colour $other")

  /** Rows of `.XO`, top row first, as a stone map. */
  def boardOf(rows: List[String]): Map[Point, Color] =
    (for
      (line, row) <- rows.zipWithIndex
      (c, col) <- line.zipWithIndex
      if c != '.'
    yield Point(col, row) -> (if c == 'X' then Color.Black else Color.White)).toMap

  def rowsOf(stones: Map[Point, Color], size: BoardSize): List[String] =
    List.tabulate(size.lines): row =>
      List
        .tabulate(size.lines): col =>
          stones.get(Point(col, row)).fold('.')(c => if c == Color.Black then 'X' else 'O')
        .mkString

  def setupOf(f: FixtureCase, ruleset: Ruleset): Setup =
    val size = BoardSize(f.size).getOrElse(sys.error(s"${f.id}: board size ${f.size}"))
    Setup(
      size = size,
      ruleset = ruleset,
      komi = f.komi.getOrElse(Komi.standard(ruleset, f.handicap)),
      handicap = f.handicap,
      position = f.setup.map: s =>
        Position(boardOf((s \ "board").as[List[String]]), color((s \ "toMove").as[String]))
    )

  /** A move token (README, "Move tokens") applied to a game. */
  def applyToken(game: GoGame, token: String): Either[Refusal, GoGame] = token match
    case "pass" => game.pass
    case "resume" => game.resume
    case "undo" => game.undo
    case point => Point.fromSgf(point).fold(sys.error(s"bad move token $point"))(game.play)
