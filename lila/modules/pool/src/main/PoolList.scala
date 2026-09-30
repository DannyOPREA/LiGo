package lila.pool

import chess.Clock
import play.api.libs.json.Json

import lila.core.pool.IsPoolCompatible

object PoolList:

  import PoolConfig.{ *, given }

  extension (i: Int)
    def ++(increment: Int) = Clock.Config(Clock.LimitSeconds(i * 60), Clock.IncrementSeconds(increment))
    def players = NbPlayers(i)

  /* LiGo: every pool runs a wave every 5 s (ADR 0022 §1); lila's full-wave sizes stay. The clocks and
   * ids are still lila's, all on 19×19, because the lobby page lists them itself (ui/lobby/src/lobby.ts)
   * and 5 of ADR 0022's 7 pools need the byo-yomi clock (unit 4.7): ADR 0022's list replaces this one
   * in the rest of unit 6.4. */
  private val wave = 5.seconds

  val all: List[PoolConfig] = List(
    PoolConfig(1 ++ 0, Wave(wave, 40.players)),
    PoolConfig(2 ++ 1, Wave(wave, 30.players)),
    PoolConfig(3 ++ 0, Wave(wave, 40.players)),
    PoolConfig(3 ++ 2, Wave(wave, 30.players)),
    PoolConfig(5 ++ 0, Wave(wave, 40.players)),
    PoolConfig(5 ++ 3, Wave(wave, 26.players)),
    PoolConfig(10 ++ 0, Wave(wave, 30.players)),
    PoolConfig(10 ++ 5, Wave(wave, 30.players)),
    PoolConfig(15 ++ 10, Wave(wave, 20.players)),
    PoolConfig(30 ++ 0, Wave(wave, 20.players)),
    PoolConfig(30 ++ 20, Wave(wave, 20.players))
  )

  def find(clock: Clock.Config, go: ligo.gorules.Setup): Option[PoolConfig] =
    all.find(p => p.clock == clock && p.go == go)

  given isPoolCompatible: IsPoolCompatible = IsPoolCompatible: (clock, go) =>
    find(clock, go).isDefined

  def json(using lila.core.i18n.Translator) = Json.toJson(all)
