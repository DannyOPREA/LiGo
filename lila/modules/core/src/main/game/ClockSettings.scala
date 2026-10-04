package lila.core
package game

import _root_.chess.{ Clock, Speed }
import ligo.gorules.{ ByoyomiClock, ByoyomiConfig, Color as GoColor }

/** The real-time clock a lobby seek or a challenge asks for (unit 4.9): lila's Fischer clock (main time plus
  * an increment per move) or a byo-yomi clock (main time, then a number of fixed periods, ADR 0020 §7).
  * `GameClock` is the running clock of a game; this is only its settings.
  */
enum ClockSettings:
  case Fischer(config: Clock.Config)
  case Byoyomi(config: ByoyomiConfig)

  def fischer: Option[Clock.Config] = this match
    case Fischer(c) => c.some
    case Byoyomi(_) => none

  def byoyomi: Option[ByoyomiConfig] = this match
    case Fischer(_) => none
    case Byoyomi(c) => c.some

  def estimateTotalSeconds: Int = this match
    case Fischer(c) => c.estimateTotalSeconds
    case Byoyomi(c) => ClockSettings.byoyomiEstimate(c)

  def speed: Speed = this match
    case Fischer(c) => Speed(c)
    case Byoyomi(_) => Speed.byTime(estimateTotalSeconds)

  /** "5+3" for Fischer, as lila shows it; "10+5×30s" for byo-yomi: main minutes, then periods × seconds. */
  def show: String = this match
    case Fischer(c) => c.show
    case Byoyomi(c) => ClockSettings.showByoyomi(c)

object ClockSettings:

  /** strategygames' estimate of a byo-yomi game's length per player, as `GameClock` uses for a running one.
    */
  def byoyomiEstimate(c: ByoyomiConfig): Int =
    ByoyomiClock(c, GoColor.Black).fold(_ => c.mainSeconds, _.estimateTotalSeconds)

  def showByoyomi(c: ByoyomiConfig): String =
    s"${showMinutes(c.mainSeconds)}+${c.periods}×${c.periodSeconds}s"

  // lila's way of writing a clock's minutes: whole minutes, or ¼, ½, ¾ and 1½
  private def showMinutes(seconds: Int): String = seconds match
    case 15 => "¼"
    case 30 => "½"
    case 45 => "¾"
    case 90 => "1½"
    case s if s % 60 == 0 => (s / 60).toString
    case s => f"${s / 60d}%.1f"
