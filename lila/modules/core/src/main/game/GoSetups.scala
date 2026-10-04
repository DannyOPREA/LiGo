package lila.core
package game

import ligo.gorules.{ BoardSize, Komi, Ruleset, Setup as GoSetup }
import play.api.libs.json.*
import reactivemongo.api.bson.*

import lila.core.lilaism.Lilaism.toTry

/** The Go options a new game is created with (unit 3.15, ADR 0019 §8 amendment): board size, ruleset and
  * komi, carried by lobby hooks and seeks, challenges and bulk pairings as go-rules' own `Setup`, plus the
  * handicap a casual challenge asks for (unit 4.9). A custom position is never set here.
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

  /** A setup from form or API values; komi defaults to the ruleset's standard komi for the handicap (0.5 with
    * any handicap, R-KOMI-2). The handicap is 0 (even), 1 (no stone, Black first) or 2 to 9 stones (R-HCP-1),
    * checked by starting a game from it.
    */
  def make(size: Int, ruleset: String, komi: Option[Double], handicap: Int = 0): Either[String, GoSetup] =
    for
      sz <- BoardSize(size).toRight(s"board size must be one of ${sizes.mkString(", ")}")
      ru <- rulesets
        .get(ruleset)
        .toRight(s"ruleset must be one of ${rulesets.keys.toList.sorted.mkString(", ")}")
      km = komi.getOrElse(Komi.standard(ru, handicap))
      _ <- Either.cond(Komi.isValid(km, sz), (), s"komi must be a multiple of 0.5 no bigger than the board")
      setup = GoSetup(sz, ru, km, handicap)
      _ <- ligo.gorules.GoGame.start(setup).left.map(_.message)
    yield setup

  /** Rated games use the standard komi (ADR 0021 §4). */
  def hasStandardKomi(s: GoSetup): Boolean = s.komi == Komi.standard(s.ruleset, s.handicap)

  /** The most handicap stones a rated game may have (ADR 0021 §4): 9 on 19×19, 4 on 9×9; none for 13×13,
    * which can't be rated until its own ADR.
    */
  def maxRatedHandicap(size: BoardSize): Option[Int] = size match
    case BoardSize.Nineteen => 9.some
    case BoardSize.Nine => 4.some
    case BoardSize.Thirteen => none

  /** Why a game with this setup can't be rated, if it can't (ADR 0021 §4, unit 5.7): only games the handicap
    * maths was calibrated for are rated, so 9×9 or 19×19, no custom position, at most `maxRatedHandicap`
    * stones and the spec's komi. The forms refuse a rated game that fails this, game creation makes it
    * casual, and the rating update checks it last (unit 5.3).
    */
  def ratedRefusal(s: GoSetup): Option[String] =
    maxRatedHandicap(s.size) match
      case None => s"a ${s.size.lines}x${s.size.lines} board".some
      case _ if s.position.isDefined => "a custom starting position".some
      case Some(max) if s.handicap > max => s"handicap ${s.handicap} on ${s.size.lines}x${s.size.lines}".some
      case _ if !hasStandardKomi(s) => s"komi ${s.komi}".some
      case _ => none

  def canBeRated(s: GoSetup): Boolean = ratedRefusal(s).isEmpty

  /** The `variant` the browser still reads from game and challenge JSON (as lichess's standard chess) until
    * 3.19 part 2 takes chess out of it; lila itself has no chess variants since unit 3.17.
    */
  val legacyVariantJson: JsObject = Json.obj("key" -> "standard", "name" -> "Standard", "short" -> "Std")

  /** `{ size, rules, komi, handicap? }`, the keys of a game's own `go` block (unit 3.12). */
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
