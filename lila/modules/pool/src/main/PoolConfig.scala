package lila.pool

import ligo.gorules.{ BoardSize, Setup as GoSetup }
import play.api.i18n.Lang

import lila.core.game.GoSetups
import lila.core.i18n.Translator
import lila.core.pool.PoolConfigId
import lila.rating.PerfType

/* LiGo: a pool plays one board size with Japanese rules and the spec's komi (ADR 0022 §1), rated in the
 * one Go perf (ADR 0021 §1). */
case class PoolConfig(
    clock: chess.Clock.Config,
    wave: PoolConfig.Wave,
    size: BoardSize = BoardSize.Nineteen
):
  val perfKey: PerfKey = PerfKey.go
  val go: GoSetup = GoSetups.default.copy(size = size)
  // lila's id, the clock alone: fine while every pool is 19×19; ADR 0022's ids (with the size) come in
  // the rest of unit 6.4
  val id = PoolConfig.clockToId(clock)

object PoolConfig:

  opaque type NbPlayers = Int
  object NbPlayers extends OpaqueInt[NbPlayers]

  case class Wave(every: FiniteDuration, players: NbPlayers)

  def clockToId(clock: chess.Clock.Config) = PoolConfigId(clock.show)

  import play.api.libs.json.*
  import lila.common.Json.given
  private given Lang = lila.core.i18n.defaultLang
  given (using Translator): OWrites[PoolConfig] = OWrites: p =>
    Json.obj(
      "id" -> p.id,
      "lim" -> p.clock.limitInMinutes,
      "inc" -> p.clock.incrementSeconds,
      "size" -> p.size.lines,
      "perf" -> PerfType(p.perfKey).trans
    )
