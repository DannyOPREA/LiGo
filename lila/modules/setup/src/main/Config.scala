package lila.setup

import chess.format.Fen
import chess.{ Clock, Speed }
import scalalib.model.Days

import lila.core.setup.GoOptions
import lila.lobby.TriColor
import lila.rating.PerfType

private[setup] trait Config:

  // Whether or not to use a clock
  val timeMode: TimeMode

  // Clock time in minutes
  val time: Double

  // Clock increment in seconds
  val increment: Clock.IncrementSeconds

  // Correspondence days per turn
  val days: Days

  // Board size, ruleset and komi (unit 3.15)
  val go: GoOptions

  def goSetup: ligo.gorules.Setup = go.orDefault

  def hasClock = timeMode == TimeMode.RealTime

  def validClock = !hasClock || clockHasTime

  def validSpeed(isBot: Boolean) =
    !isBot || makeClock.forall: c =>
      Speed(c) >= Speed.Bullet

  def clockHasTime = time + increment.value > 0

  def makeClock = hasClock.option(justMakeClock)

  protected def justMakeClock =
    Clock.Config(
      Clock.LimitSeconds((time * 60).toInt),
      if clockHasTime then increment else Clock.IncrementSeconds(1)
    )

  def makeDaysPerTurn: Option[Days] = (timeMode == TimeMode.Correspondence).option(days)

  def makeSpeed: Speed = chess.Speed(makeClock)

  // Go's one perf (ADR 0021 §1)
  def perfType: PerfType = PerfType.Go
  def perfKey = perfType.key

trait WithColor:
  self: Config =>

  // creator player color
  def color: TriColor

  lazy val creatorColor: Color = color.resolve()

trait Positional:
  self: Config =>

  def fen: Option[Fen.Full]

  // Go games start from their setup, never from a chess position (unit 3.15)
  def validFen = fen.isEmpty

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
