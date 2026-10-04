package lila.setup

import chess.{ Clock, Rated }
import chess.IntRating
import scalalib.model.Days

import lila.core.perf.UserWithPerfs
import lila.core.rating.RatingRange
import lila.core.setup.GoOptions
import lila.core.id.SessionId
import lila.lobby.{ Hook, Seek, TriColor }
import lila.rating.RatingRange.withinLimits

case class HookConfig(
    timeMode: TimeMode,
    time: Double, // minutes
    increment: Clock.IncrementSeconds,
    days: Days,
    rated: Rated,
    color: TriColor,
    ratingRange: RatingRange,
    go: GoOptions = GoOptions.default,
    byoyomi: ByoyomiPeriods = ByoyomiPeriods.default
) extends HumanConfig:

  def withinLimits(using me: Option[Me], perf: Perf): HookConfig =
    if me.isEmpty then this
    else copy(ratingRange = ratingRange.withinLimits(perf.intRating, 500))

  def >> = (
    none[String],
    timeMode.id,
    time,
    increment,
    days,
    rated.id.some,
    ratingRange.toString.some,
    color.name.some,
    go.size,
    go.ruleset,
    go.komi,
    byoyomi.periods,
    byoyomi.seconds
  ).some

  def withTimeModeString(tc: Option[String]) =
    tc match
      case Some("realTime") => copy(timeMode = TimeMode.RealTime)
      case Some("byoyomi") => copy(timeMode = TimeMode.Byoyomi)
      case Some("correspondence") => copy(timeMode = TimeMode.Correspondence)
      case Some("unlimited") => copy(timeMode = TimeMode.Unlimited)
      case _ => this

  def hook(
      sri: lila.core.socket.Sri,
      user: Option[UserWithPerfs],
      sid: Option[SessionId],
      blocking: lila.core.pool.Blocking
  ): Either[Hook, Option[Seek]] =
    makeClockSettings match
      case Some(clock) =>
        Left:
          Hook.make(
            sri = sri,
            go = goSetup,
            clock = clock,
            rated = rated,
            color = color,
            user = user,
            blocking = blocking,
            sid = sid,
            ratingRange = ratingRange
          )
      case None =>
        Right:
          user.map: u =>
            Seek.make(
              go = goSetup,
              daysPerTurn = makeDaysPerTurn,
              rated = rated,
              user = u,
              blocking = blocking,
              ratingRange = ratingRange
            )

  def updateFrom(game: Game) =
    val h1 = copy(
      timeMode = TimeMode.ofGame(game),
      time = game.byoyomi.map(_.config.mainSeconds / 60d).orElse(game.clock.map(_.limitInMinutes)) | time,
      increment = game.clock.map(_.incrementSeconds) | increment,
      days = game.daysPerTurn | days,
      rated = Rated.No, // casual until unit 5.7, even after an older rated game
      go = GoOptions.of(game.go.setup.copy(handicap = 0, position = None)),
      byoyomi = game.byoyomi.fold(byoyomi)(b => ByoyomiPeriods(b.config.periods, b.config.periodSeconds))
    )
    val h2 = if h1.isRatedUnlimited then h1.copy(rated = Rated.No) else h1
    if !h2.validClock then h2.copy(time = 1) else h2

  def withRatingRange(ratingRange: String) =
    copy(ratingRange = RatingRange.orDefault(ratingRange))
  def withRatingRange(rating: Option[IntRating], deltaMin: Option[String], deltaMax: Option[String]) =
    copy(ratingRange = lila.rating.RatingRange.orDefault(rating, deltaMin, deltaMax))

object HookConfig extends BaseConfig:

  def from(
      @annotation.unused v: Option[String], // a chess variant, refused by the form (unit 3.17)
      tm: Int,
      t: Double,
      i: Clock.IncrementSeconds,
      d: Days,
      m: Option[Int],
      e: Option[String],
      c: Option[String],
      size: Option[Int] = None,
      ruleset: Option[String] = None,
      komi: Option[Double] = None,
      periods: Int = ByoyomiPeriods.default.periods,
      periodTime: Int = ByoyomiPeriods.default.seconds
  ) =
    new HookConfig(
      timeMode = TimeMode(tm).err(s"Invalid time mode $tm"),
      time = t,
      increment = i,
      days = d,
      rated = m.fold(Rated.default)(Rated.orDefault),
      color = TriColor.orDefault(c),
      ratingRange = e.fold(RatingRange.default)(RatingRange.orDefault),
      go = GoOptions(size, ruleset, komi),
      byoyomi = ByoyomiPeriods(periods, periodTime)
    )

  // Go games are casual until Phase 5 (PLAN §5, unit 3.15)
  def default(auth: Boolean): HookConfig = default.copy(rated = Rated.No)

  private val default = HookConfig(
    timeMode = TimeMode.RealTime,
    time = 5d,
    increment = Clock.IncrementSeconds(3),
    days = Days(2),
    rated = Rated.default,
    ratingRange = RatingRange.default,
    color = TriColor.default
  )

  import lila.db.BSON
  import lila.db.dsl.{ *, given }

  private[setup] given BSON[HookConfig] with

    def reads(r: BSON.Reader): HookConfig =
      HookConfig(
        timeMode = TimeMode.orDefault(r.int("tm")),
        time = r.double("t"),
        increment = r.get("i"),
        days = r.get("d"),
        rated = Rated.orDefault(r.int("m")),
        color = TriColor.Random,
        ratingRange = r.strO("e").flatMap(RatingRange.parse).getOrElse(RatingRange.default),
        byoyomi = ByoyomiPeriods.read(r.intO("bp"), r.intO("bs"))
      )

    def writes(w: BSON.Writer, o: HookConfig) =
      bdoc(
        "tm" -> o.timeMode.id,
        "t" -> o.time,
        "i" -> o.increment,
        "d" -> o.days,
        "m" -> o.rated.id,
        "e" -> o.ratingRange.toString,
        "bp" -> o.byoyomi.periods,
        "bs" -> o.byoyomi.seconds
      )
