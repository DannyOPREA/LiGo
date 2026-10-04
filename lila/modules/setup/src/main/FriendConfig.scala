package lila.setup

import chess.{ Clock, Rated }
import scalalib.model.Days

import lila.core.setup.GoOptions
import lila.lobby.TriColor

case class FriendConfig(
    timeMode: TimeMode,
    time: Double,
    increment: Clock.IncrementSeconds,
    days: Days,
    rated: Rated,
    color: TriColor,
    go: GoOptions = GoOptions.default,
    byoyomi: ByoyomiPeriods = ByoyomiPeriods.default
) extends HumanConfig
    with WithColor:

  def >> =
    (
      none[String],
      timeMode.id,
      time,
      increment,
      days,
      rated.id.some,
      color.name,
      none[String],
      go.size,
      go.ruleset,
      go.komi,
      byoyomi.periods,
      byoyomi.seconds,
      go.handicap
    ).some

  def isPersistent = timeMode == TimeMode.Unlimited || timeMode == TimeMode.Correspondence

object FriendConfig extends BaseConfig:

  def from(
      @annotation.unused v: Option[String], // a chess variant, refused by the form (unit 3.17)
      tm: Int,
      t: Double,
      i: Clock.IncrementSeconds,
      d: Days,
      m: Option[Int],
      c: String,
      @annotation.unused fen: Option[String], // refused by the form (unit 3.17)
      size: Option[Int] = None,
      ruleset: Option[String] = None,
      komi: Option[Double] = None,
      periods: Int = ByoyomiPeriods.default.periods,
      periodTime: Int = ByoyomiPeriods.default.seconds,
      handicap: Option[Int] = None
  ) =
    new FriendConfig(
      timeMode = TimeMode(tm).err(s"Invalid time mode $tm"),
      time = t,
      increment = i,
      days = d,
      rated = m.fold(Rated.default)(Rated.orDefault),
      color = TriColor(c).err("Invalid color " + c),
      go = GoOptions(size, ruleset, komi, handicap),
      byoyomi = ByoyomiPeriods(periods, periodTime)
    )

  val default = FriendConfig(
    timeMode = TimeMode.Unlimited,
    time = 5d,
    increment = Clock.IncrementSeconds(8),
    days = Days(2),
    rated = Rated.No,
    color = TriColor.default
  )

  import lila.db.BSON
  import lila.db.dsl.{ *, given }

  private[setup] given BSON[FriendConfig] with

    def reads(r: BSON.Reader): FriendConfig =
      FriendConfig(
        timeMode = TimeMode.orDefault(r.int("tm")),
        time = r.double("t"),
        increment = r.get("i"),
        days = r.get("d"),
        rated = Rated.orDefault(r.int("m")),
        color = TriColor.White,
        byoyomi = ByoyomiPeriods.read(r.intO("bp"), r.intO("bs"))
      )

    def writes(w: BSON.Writer, o: FriendConfig) =
      bdoc(
        "tm" -> o.timeMode.id,
        "t" -> o.time,
        "i" -> o.increment,
        "d" -> o.days,
        "m" -> o.rated.id,
        "bp" -> o.byoyomi.periods,
        "bs" -> o.byoyomi.seconds
      )
