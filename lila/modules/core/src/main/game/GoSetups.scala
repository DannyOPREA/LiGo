package lila.core
package game

import ligo.gorules.{ BoardSize, Komi, Ruleset, Setup as GoSetup }
import play.api.libs.json.*
import reactivemongo.api.bson.*

import lila.core.lilaism.Lilaism.toTry

/** The Go options a new game is created with (unit 3.15, ADR 0019 §8 amendment): board size, ruleset and
  * komi, carried by lobby hooks and seeks, challenges and bulk pairings as go-rules' own `Setup`. Handicap is
  * always 0 until unit 4.9 and a custom position is never set here.
  */
object GoSetups:

  val sizes: List[Int] = BoardSize.values.toList.map(_.lines)

  val rulesets: Map[String, Ruleset] = Map("japanese" -> Ruleset.Japanese, "chinese" -> Ruleset.Chinese)

  def rulesetKey(r: Ruleset): String = r match
    case Ruleset.Japanese => "japanese"
    case Ruleset.Chinese => "chinese"

  /** 19×19, Japanese rules, 6.5 komi: what a form or API call that says nothing gets, and what the pools play
    * (ADR 0022 §1).
    */
  val default: GoSetup = GoSetup(BoardSize.Nineteen, Ruleset.Japanese, Komi.standard(Ruleset.Japanese, 0))

  /** A setup from form or API values; komi defaults to the ruleset's standard komi. */
  def make(size: Int, ruleset: String, komi: Option[Double]): Either[String, GoSetup] =
    for
      sz <- BoardSize(size).toRight(s"board size must be one of ${sizes.mkString(", ")}")
      ru <- rulesets
        .get(ruleset)
        .toRight(s"ruleset must be one of ${rulesets.keys.toList.sorted.mkString(", ")}")
      km = komi.getOrElse(Komi.standard(ru, 0))
      _ <- Either.cond(Komi.isValid(km, sz), (), s"komi must be a multiple of 0.5 no bigger than the board")
    yield GoSetup(sz, ru, km)

  /** Rated games use the standard komi (ADR 0021 §4). */
  def hasStandardKomi(s: GoSetup): Boolean = s.komi == Komi.standard(s.ruleset, s.handicap)

  /** `{ size, rules, komi, handicap? }`, the keys of a game's own `go` block (unit 3.12). */
  /** The `variant` the browser still reads from game and challenge JSON (as lichess's standard chess) until
    * 3.19 part 2 takes chess out of it; lila itself has no chess variants since unit 3.17.
    */
  val legacyVariantJson: JsObject = Json.obj("key" -> "standard", "name" -> "Standard", "short" -> "Std")

  def json(s: GoSetup): JsObject =
    Json
      .obj("size" -> s.size.lines, "rules" -> rulesetKey(s.ruleset), "komi" -> s.komi)
      .add("handicap" -> Option.when(s.handicap > 0)(s.handicap))

  /** Stored with the keys of a game's Go block (ADR 0019 §4): `sz`, `ru` (`j`/`c`), `km` (komi × 2) and `hc`
    * (omitted when 0). A custom position is never stored here.
    */
  given bsonHandler: BSONDocumentHandler[GoSetup] = BSONDocumentHandler.from[GoSetup](
    doc =>
      for
        sz <- doc.getAsTry[Int]("sz").flatMap(n => BoardSize(n).toTry(s"bad board size $n"))
        ru <- doc
          .getAsTry[String]("ru")
          .flatMap:
            case "j" => scala.util.Success(Ruleset.Japanese)
            case "c" => scala.util.Success(Ruleset.Chinese)
            case r => scala.util.Failure(new Exception(s"bad ruleset $r"))
        km <- doc.getAsTry[Int]("km")
      yield GoSetup(sz, ru, km / 2.0, doc.getAsOpt[Int]("hc").getOrElse(0)),
    s =>
      scala.util.Success(
        BSONDocument(
          "sz" -> s.size.lines,
          "ru" -> (if s.ruleset == Ruleset.Japanese then "j" else "c"),
          "km" -> (s.komi * 2).toInt,
          "hc" -> Option.when(s.handicap != 0)(s.handicap)
        )
      )
  )
