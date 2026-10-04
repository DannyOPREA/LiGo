package lila.setup

import chess.format.Fen
import chess.variant.Variant
import chess.{ Clock, Rated }
import scalalib.model.Days

import lila.core.setup.GoOptions
import lila.lobby.TriColor

case class FriendConfig(
    variant: chess.variant.Variant,
    timeMode: TimeMode,
    time: Double,
    increment: Clock.IncrementSeconds,
    days: Days,
    rated: Rated,
    color: TriColor,
    fen: Option[Fen.Full] = None,
    go: GoOptions = GoOptions.default,
    byoyomi: ByoyomiPeriods = ByoyomiPeriods.default
) extends HumanConfig
    with Positional
    with WithColor:

  def >> =
    (
      variant.id,
      timeMode.id,
      time,
      increment,
      days,
      rated.id.some,
      color.name,
      fen,
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
      v: Variant.Id,
      tm: Int,
      t: Double,
      i: Clock.IncrementSeconds,
      d: Days,
      m: Option[Int],
      c: String,
      fen: Option[Fen.Full],
      size: Option[Int] = None,
      ruleset: Option[String] = None,
      komi: Option[Double] = None,
      periods: Int = ByoyomiPeriods.default.periods,
      periodTime: Int = ByoyomiPeriods.default.seconds,
      handicap: Option[Int] = None
  ) =
    new FriendConfig(
      variant = chess.variant.Variant.orDefault(v),
      timeMode = TimeMode(tm).err(s"Invalid time mode $tm"),
      time = t,
      increment = i,
      days = d,
      rated = m.fold(Rated.default)(Rated.orDefault),
      color = TriColor(c).err("Invalid color " + c),
      fen = fen,
      go = GoOptions(size, ruleset, komi, handicap),
      byoyomi = ByoyomiPeriods(periods, periodTime)
    )

  val default = FriendConfig(
    variant = variantDefault,
    timeMode = TimeMode.Unlimited,
    time = 5d,
    increment = Clock.IncrementSeconds(8),
    days = Days(2),
    rated = Rated.No, // casual until Phase 5
    color = TriColor.default
  )

  import lila.db.BSON
  import lila.db.dsl.{ *, given }

  private[setup] given BSON[FriendConfig] with

    def reads(r: BSON.Reader): FriendConfig =
      FriendConfig(
        variant = Variant.idOrDefault(r.getO[Variant.Id]("v")),
        timeMode = TimeMode.orDefault(r.int("tm")),
        time = r.double("t"),
        increment = r.get("i"),
        days = r.get("d"),
        rated = Rated.orDefault(r.int("m")),
        color = TriColor.White,
        fen = r.getO[Fen.Full]("f").filter(_.value.nonEmpty),
        byoyomi = ByoyomiPeriods.read(r.intO("bp"), r.intO("bs"))
      )

    def writes(w: BSON.Writer, o: FriendConfig) =
      bdoc(
        "v" -> o.variant.id,
        "tm" -> o.timeMode.id,
        "t" -> o.time,
        "i" -> o.increment,
        "d" -> o.days,
        "m" -> o.rated.id,
        "f" -> o.fen,
        "bp" -> o.byoyomi.periods,
        "bs" -> o.byoyomi.seconds
      )
