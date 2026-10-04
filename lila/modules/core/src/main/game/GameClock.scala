package lila.core
package game

import _root_.chess.{ Centis, Clock, Color, Speed }
import ligo.gorules.ByoyomiClock

/** A game's real-time clock, whichever kind it is (ADR 0020 §7): scalachess's Fischer clock, kept in
  * `Game.clock` and read by the chess-era code as before, or go-rules' byo-yomi clock, kept in
  * `Game.byoyomi`. The round reads a game's clock through this, so it treats both the same way where they
  * behave the same: running, out of time, time left, the expected length and the speed category.
  */
enum GameClock:
  case Fischer(clock: Clock)
  case Byoyomi(clock: ByoyomiClock)

  def isRunning: Boolean = this match
    case Fischer(c) => c.isRunning
    case Byoyomi(c) => c.isRunning

  def outOfTime(color: Color, withGrace: Boolean): Boolean = this match
    case Fischer(c) => c.outOfTime(color, withGrace)
    case Byoyomi(c) => c.outOfTime(GoBridge.goColor(color), withGrace)

  /** Time left on `color`'s clock now: Fischer's remaining time, or byo-yomi's main time, then the time left
    * in the current period.
    */
  def remainingTime(color: Color): Centis = this match
    case Fischer(c) => c.remainingTime(color)
    case Byoyomi(c) => Centis(c.reading(GoBridge.goColor(color)).centis)

  /** True once either player has used time: a stopped clock like this in a game still in play means the
    * player to move is out of time (lila's rule, `Game.outoftime`).
    */
  def anyTimeUsed: Boolean = this match
    case Fischer(c) => c.players.exists(_.elapsed.centis > 0)
    case Byoyomi(c) => c.anyTimeUsed

  /** Where each player's time starts: the Fischer limit, or byo-yomi's main time. The clock history is stored
    * relative to it.
    */
  def startTime: Centis = this match
    case Fischer(c) => c.limit
    case Byoyomi(c) => Centis(c.config.mainSeconds * 100)

  def estimateTotalSeconds: Int = this match
    case Fischer(c) => c.estimateTotalSeconds
    case Byoyomi(c) => c.estimateTotalSeconds

  def moretimeable(color: Color): Boolean = this match
    case Fischer(c) => c.moretimeable(color)
    case Byoyomi(c) => c.moretimeable(GoBridge.goColor(color))

  def speed: Speed = this match
    case Fischer(c) => Speed(c.config)
    case Byoyomi(c) => Speed.byTime(c.estimateTotalSeconds)

  /** The time control as players read it: "5+3", or "10+5×30s" for byo-yomi (`ClockSettings.show`). */
  def show: String = this match
    case Fischer(c) => c.config.show
    case Byoyomi(c) => ClockSettings.showByoyomi(c.config)
