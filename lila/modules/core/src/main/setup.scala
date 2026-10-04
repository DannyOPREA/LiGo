package lila.core
package setup

import _root_.chess.{ Rated, Clock }
import scalalib.model.Days

import lila.core.game.{ GameRule, GoSetups }
import lila.core.userId.UserId

/** The Go options of a game creation form or API call (unit 3.15): all optional, defaulting to
  * [[GoSetups.default]]'s 19×19, Japanese rules, no handicap and the standard komi for the handicap. The
  * handicap comes from the challenge forms (unit 4.9); lobby seeks stay even.
  */
final case class GoOptions(
    size: Option[Int],
    ruleset: Option[String],
    komi: Option[Double],
    handicap: Option[Int] = None
):
  lazy val setup: Either[String, ligo.gorules.Setup] =
    GoSetups.make(
      size | GoSetups.default.size.lines,
      ruleset | GoSetups.rulesetKey(GoSetups.default.ruleset),
      komi,
      handicap | 0
    )
  def valid = setup.isRight

  /** The setup, once the form has checked it: the default if it is invalid. */
  def orDefault: ligo.gorules.Setup = setup.getOrElse(GoSetups.default)

object GoOptions:
  val default = GoOptions(none, none, none)
  def of(s: ligo.gorules.Setup) =
    GoOptions(
      s.size.lines.some,
      GoSetups.rulesetKey(s.ruleset).some,
      s.komi.some,
      Option.when(s.handicap > 0)(s.handicap)
    )

trait OpenConfig:
  val name: Option[String]
  val clock: Option[Clock.Config]
  val days: Option[Days]
  val rated: Rated
  val userIds: Option[PairOf[UserId]]
  val rules: Set[game.GameRule]
  val expiresAt: Option[Instant]
  val byoyomi: Option[ligo.gorules.ByoyomiConfig]
  def goSetup: ligo.gorules.Setup

trait SetupForm:
  import play.api.data.Mapping
  private type Named[T] = (String, Mapping[T])
  // Refuses a chess `variant` field: only Go games are created (unit 3.17).
  def variant: Named[Option[String]]
  // Refuses a `fen` field: a Go game never starts from a chess position (unit 3.17).
  def noFen: Mapping[Option[String]]
  def message: Named[Option[String]]
  def clock: Named[Option[Clock.Config]]
  def optionalDays: Named[Option[Days]]
  def rules: Named[Option[Set[GameRule]]]
  def goSize: Named[Option[Int]]
  def goRuleset: Named[Option[String]]
  def goKomi: Named[Option[Double]]
  def goHandicap: Named[Option[Int]]
