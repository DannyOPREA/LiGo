package ligo.gorules

import strategygames.{ ByoyomiClock as SgClock, Centis, MoveMetrics, Player, Timestamp, Timestamper }

// Licence: MIT (LiGo's own code, ADR 0006).

/** Byo-yomi settings: `mainSeconds` of main time, then `periods` periods of `periodSeconds` each. Main time
  * may be 0 (straight into byo-yomi). Which values lila offers is game creation's business (unit 4.9).
  */
final case class ByoyomiConfig(mainSeconds: Int, periods: Int, periodSeconds: Int):
  // strategygames makes the first period at least 5 s when there is no main time, so shorter periods would
  // differ between the first and the rest.
  def isValid: Boolean =
    mainSeconds >= 0 && periods >= 1 && periodSeconds >= (if mainSeconds == 0 then 5 else 1)
  override def toString = s"$mainSeconds s + $periods × $periodSeconds s"

/** One player's clock as it reads now.
  *
  * @param centis
  *   time left in main time, or in the current period once in byo-yomi, in hundredths of a second
  * @param periodsLeft
  *   periods left, counting the one in progress
  * @param inByoyomi
  *   main time is used up
  */
final case class ByoyomiReading(centis: Int, periodsLeft: Int, inByoyomi: Boolean)

/** What lila stores to rebuild a clock (ADR 0020 §7, key `cy`): each player's time already used (main time
  * and the current period count as one budget, as in strategygames) and periods used up, whose clock it is,
  * and since when it has been running (epoch milliseconds; `None` when stopped). Lag statistics are not kept:
  * a reloaded clock starts them afresh, as lila's Fischer clock does.
  */
final case class ByoyomiState(
    config: ByoyomiConfig,
    toMove: Color,
    blackElapsedCentis: Int,
    blackSpentPeriods: Int,
    whiteElapsedCentis: Int,
    whiteSpentPeriods: Int,
    runningSince: Option[Long]
)

/** A byo-yomi clock: strategygames' `ByoyomiClock` (ADR 0012) behind go-rules' own types, so lila never sees
  * strategygames.
  *
  * The rules are the usual Japanese ones: main time runs down first; after it, a move made within a period
  * keeps that period (it starts again full for the next move); a period that runs out is used up and the next
  * one starts; when the last one runs out the player is out of time. A pass is a move like any other. There
  * is no increment. lila stops the clock during the scoring phase and starts it again on resume (ADR 0020
  * §3); stopping keeps every player's time and periods.
  *
  * Values are immutable: every change returns a new clock.
  */
final class ByoyomiClock private (private val sg: SgClock):

  def config: ByoyomiConfig =
    ByoyomiConfig(sg.config.limitSeconds, sg.config.periodsTotal, sg.config.byoyomiSeconds)

  /** Whose clock it is: the player to move. */
  def toMove: Color = ByoyomiClock.colorOf(sg.player)

  def isRunning: Boolean = sg.isRunning

  /** Starts the clock of the player to move (after the first move, and on resuming from scoring). */
  def start: ByoyomiClock = wrap(sg.start)

  /** Stops the clock, charging the time used so far to the player to move (scoring phase, game end). */
  def stop: ByoyomiClock = wrap(sg.stop())

  /** The player to move has moved (a stone or a pass): charges the time taken, less the lag compensation
    * strategygames grants (lila's recipe), and switches to the opponent. On a stopped clock nothing is
    * charged: lila must `start` the clock after the first move and on resuming from the scoring phase. With
    * `gameActive = false` the clock stops but still switches, so the stored side to move is the opponent's.
    *
    * @param clientLagCentis
    *   the network lag the player's browser reported, if any
    * @param clientMoveCentis
    *   the move time the browser measured, if any (it then replaces the reported lag)
    * @param gameActive
    *   false when this move ends the game: the clock then stops instead of switching on
    */
  def move(
      clientLagCentis: Option[Int] = None,
      clientMoveCentis: Option[Int] = None,
      gameActive: Boolean = true
  ): ByoyomiClock =
    wrap(sg.step(MoveMetrics(clientLagCentis.map(Centis(_)), clientMoveCentis.map(Centis(_))), gameActive))

  /** True when `color` has used up main time and every period. `withGrace` allows for the player's own lag,
    * as lila does before it flags a player.
    */
  def outOfTime(color: Color, withGrace: Boolean = false): Boolean =
    sg.outOfTime(ByoyomiClock.playerOf(color), withGrace)

  def reading(color: Color): ByoyomiReading =
    val player = ByoyomiClock.playerOf(color)
    val info = sg.currentClockFor(player)
    val inByoyomi = info.periods > 0
    val left = config.periods - info.periods + (if inByoyomi then 1 else 0)
    if left <= 0 || sg.outOfTime(player, withGrace = false) then ByoyomiReading(0, 0, inByoyomi = true)
    else ByoyomiReading(info.time.centis, left, inByoyomi)

  /** Adds `centis` (> 0) to `color`'s main time, or to the current period once in byo-yomi: lila's "give more
    * time" button. Time given in byo-yomi is kept across moves until used (strategygames resets a period to
    * at least its full length, never below what is left). Refused for 0 or less.
    */
  def giveTime(color: Color, centis: Int): Either[String, ByoyomiClock] =
    Either.cond(
      centis > 0,
      wrap(sg.giveTime(ByoyomiClock.playerOf(color), Centis(centis))),
      s"cannot give $centis cs"
    )

  def state: ByoyomiState =
    val b = sg.players(Player.P1)
    val w = sg.players(Player.P2)
    ByoyomiState(
      config,
      toMove,
      b.elapsed.centis,
      b.spentPeriods,
      w.elapsed.centis,
      w.spentPeriods,
      sg.timestamp.map(_.value)
    )

  private def wrap(c: strategygames.ClockBase): ByoyomiClock = c match
    case b: SgClock => new ByoyomiClock(b)
    case other => sys.error(s"strategygames returned a ${other.getClass.getSimpleName} for a byo-yomi clock")

  override def toString = s"ByoyomiClock($config, $toMove to move, running: $isRunning)"

object ByoyomiClock:

  /** A new clock, stopped, with `firstToMove`'s side current (White in handicap games, R-HCP-3). */
  def apply(
      config: ByoyomiConfig,
      firstToMove: Color,
      now: () => Long = () => System.currentTimeMillis
  ): Either[String, ByoyomiClock] =
    if !config.isValid then Left(s"invalid byo-yomi settings: $config")
    else
      val c = SgClock(SgClock.Config(config.mainSeconds, 0, config.periodSeconds, config.periods))
        .copy(timestamper = timestamper(now))
      Right(new ByoyomiClock(if firstToMove == Color.White then c.copy(player = Player.P2) else c))

  /** Rebuilds a stored clock. */
  def restore(
      state: ByoyomiState,
      now: () => Long = () => System.currentTimeMillis
  ): Either[String, ByoyomiClock] =
    apply(state.config, state.toMove, now).map: fresh =>
      val sg = fresh.sg
      def player(elapsed: Int, spent: Int) =
        sg.players(Player.P1).copy(elapsed = Centis(elapsed), spentPeriods = spent)
      new ByoyomiClock(
        sg.copy(
          players = Player.Map(
            player(state.blackElapsedCentis, state.blackSpentPeriods),
            player(state.whiteElapsedCentis, state.whiteSpentPeriods)
          ),
          timestamp = state.runningSince.map(Timestamp(_))
        )
      )

  private def timestamper(clock: () => Long): Timestamper = new Timestamper:
    def now = Timestamp(clock())

  private def colorOf(player: Player): Color = if player == Player.P1 then Color.Black else Color.White
  private def playerOf(color: Color): Player = if color == Color.Black then Player.P1 else Player.P2
