package lila.pool

import ligo.gorules.{ BoardSize, Setup as GoSetup }

import lila.core.game.{ ClockSettings, GoSetups }
import lila.core.pool.PoolConfigId

/* LiGo: a pool plays one board size and one clock, Fischer or byo-yomi, with Japanese rules and the spec's
 * komi (ADR 0022 §1), rated in the one Go perf (ADR 0021 §1). */
case class PoolConfig(
    clock: ClockSettings,
    wave: PoolConfig.Wave,
    size: BoardSize
):
  val perfKey: PerfKey = PerfKey.go
  val go: GoSetup = GoSetups.default.copy(size = size)
  val id = PoolConfig.makeId(size, clock)

object PoolConfig:

  opaque type NbPlayers = Int
  object NbPlayers extends OpaqueInt[NbPlayers]

  case class Wave(every: FiniteDuration, players: NbPlayers)

  /* ADR 0022 §1's ids, in characters that need no escaping in URLs and JSON: the size, the main time in
   * minutes, then the increment ("9x9-3m-2s") or the byo-yomi periods ("9x9-1m-5x10s"). */
  def makeId(size: BoardSize, clock: ClockSettings): PoolConfigId =
    val main = clock match
      case ClockSettings.Fischer(c) => c.limitSeconds.value
      case ClockSettings.Byoyomi(c) => c.mainSeconds
    val extra = clock match
      case ClockSettings.Fischer(c) => s"${c.incrementSeconds.value}s"
      case ClockSettings.Byoyomi(c) => s"${c.periods}x${c.periodSeconds}s"
    PoolConfigId(s"${size.lines}x${size.lines}-${main / 60}m-$extra")

  import play.api.libs.json.*
  import lila.common.Json.given

  /* What the lobby page draws a tile from (unit 6.4): the id, the board size, the clock as lila writes it
   * ("3+2", "1+5×10s"), its speed for the tile's second line, and the clock's settings for a guest's click,
   * which sends a casual hook with them (ADR 0022 §2). */
  given OWrites[PoolConfig] = OWrites: p =>
    Json
      .obj(
        "id" -> p.id,
        "size" -> p.size.lines,
        "clock" -> p.clock.show,
        "speed" -> p.clock.speed.key
      )
      .add("lim" -> p.clock.fischer.map(_.limitInMinutes))
      .add("inc" -> p.clock.fischer.map(_.incrementSeconds))
      .add("byo" -> p.clock.byoyomi.map: c =>
        Json.obj("limit" -> c.mainSeconds, "periods" -> c.periods, "period" -> c.periodSeconds))
