package lila.pool

import chess.Clock
import ligo.gorules.{ BoardSize, ByoyomiConfig, Setup as GoSetup }
import play.api.libs.json.Json

import lila.core.game.ClockSettings
import lila.core.pool.IsPoolCompatible

object PoolList:

  import PoolConfig.{ *, given }

  extension (i: Int)
    // `3 ++ 2`: 3 minutes and 2 seconds a move (Fischer)
    def ++(increment: Int) = ClockSettings.Fischer(
      Clock.Config(Clock.LimitSeconds(i * 60), Clock.IncrementSeconds(increment))
    )
    // `1.byo(5, 10)`: 1 minute, then 5 periods of 10 seconds
    def byo(periods: Int, seconds: Int) = ClockSettings.Byoyomi(ByoyomiConfig(i * 60, periods, seconds))
    def players = NbPlayers(i)

  /* LiGo: ADR 0022 §1's seven pools, ADR 0005's real-time tiles, every one running a wave every 5 s. The
   * full-wave sizes are lila's for its clocks of the same length; at the POC's size they are never reached. */
  private val wave = 5.seconds
  import BoardSize.{ Nine, Nineteen }

  val all: List[PoolConfig] = List(
    PoolConfig(1.byo(5, 10), Wave(wave, 40.players), Nine),
    PoolConfig(3.byo(3, 20), Wave(wave, 40.players), Nine),
    PoolConfig(3 ++ 2, Wave(wave, 30.players), Nine),
    PoolConfig(5.byo(5, 10), Wave(wave, 30.players), Nineteen),
    PoolConfig(10.byo(5, 30), Wave(wave, 30.players), Nineteen),
    PoolConfig(20.byo(5, 30), Wave(wave, 20.players), Nineteen),
    PoolConfig(10 ++ 10, Wave(wave, 20.players), Nineteen)
  )

  def find(clock: ClockSettings, go: GoSetup): Option[PoolConfig] =
    all.find(p => p.clock == clock && p.go == go)

  given isPoolCompatible: IsPoolCompatible = IsPoolCompatible: (clock, go) =>
    find(clock, go).isDefined

  lazy val json = Json.toJson(all)
