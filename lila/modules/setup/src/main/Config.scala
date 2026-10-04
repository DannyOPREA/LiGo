package lila.setup

import chess.{ Clock, Speed }
import scalalib.model.Days

import lila.core.game.ClockSettings
import lila.core.setup.GoOptions
import lila.lobby.TriColor
import lila.rating.PerfType

private[setup] trait Config:

  // Whether or not to use a clock
  val timeMode: TimeMode

  // Clock time in minutes: Fischer's starting time, or byo-yomi's main time
  val time: Double

  // Clock increment in seconds
  val increment: Clock.IncrementSeconds

  // Correspondence days per turn
  val days: Days

  // Byo-yomi periods and the seconds in each (unit 4.9)
  val byoyomi: ByoyomiPeriods

  // Board size, ruleset and komi (unit 3.15)
  val go: GoOptions

  def goSetup: ligo.gorules.Setup = go.orDefault

  def hasClock = timeMode == TimeMode.RealTime

  def isByoyomi = timeMode == TimeMode.Byoyomi

  def validClock = (!hasClock || clockHasTime) && makeByoyomi.forall(_.isValid)

  def validSpeed(isBot: Boolean) =
    !isBot || makeClockSettings.forall(_.speed >= Speed.Bullet)

  def clockHasTime = time + increment.value > 0

  def makeClock = hasClock.option(justMakeClock)

  protected def justMakeClock =
    Clock.Config(
      Clock.LimitSeconds((time * 60).toInt),
      if clockHasTime then increment else Clock.IncrementSeconds(1)
    )

  def makeByoyomi: Option[ligo.gorules.ByoyomiConfig] =
    isByoyomi.option(ligo.gorules.ByoyomiConfig((time * 60).toInt, byoyomi.periods, byoyomi.seconds))

  // the real-time clock, Fischer or byo-yomi
  def makeClockSettings: Option[ClockSettings] =
    makeByoyomi.map(ClockSettings.Byoyomi(_)).orElse(makeClock.map(ClockSettings.Fischer(_)))

  def makeDaysPerTurn: Option[Days] = (timeMode == TimeMode.Correspondence).option(days)

  def makeSpeed: Speed = makeClockSettings.fold(chess.Speed(none))(_.speed)

  // Go's one perf (ADR 0021 §1)
  def perfType: PerfType = PerfType.Go
  def perfKey = perfType.key

trait WithColor:
  self: Config =>

  // creator player color
  def color: TriColor

  lazy val creatorColor: Color = color.resolve()

/** Byo-yomi's periods (unit 4.9): how many, and how long each is in seconds. */
case class ByoyomiPeriods(periods: Int, seconds: Int)

object ByoyomiPeriods:
  val default = ByoyomiPeriods(5, 30)
  def read(periods: Option[Int], seconds: Option[Int]) =
    ByoyomiPeriods(periods | default.periods, seconds | default.seconds)
  val periodChoices = List(1, 2, 3, 4, 5, 6, 7, 8, 9, 10)
  // the shortest period strategygames allows with no main time is 5 s (`ByoyomiConfig.isValid`)
  val secondChoices = List(5, 10, 15, 20, 30, 40, 45, 60, 90, 120, 180, 300)

object Config extends BaseConfig

trait BaseConfig:
  val speeds = Speed.all.map(_.id)

  private val timeMin = 0
  private val timeMax = 180
  private val acceptableFractions = Set(1 / 4d, 1 / 2d, 3 / 4d, 3 / 2d)
  def validateTime(t: Double) =
    t >= timeMin && t <= timeMax && (t.isWhole || acceptableFractions(t))

  private val incrementMin = Clock.IncrementSeconds(0)
  private val incrementMax = Clock.IncrementSeconds(180)
  def validateIncrement(i: Clock.IncrementSeconds) = i >= incrementMin && i <= incrementMax
