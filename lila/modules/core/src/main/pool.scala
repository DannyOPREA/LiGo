package lila.core
package pool

import _root_.chess.ByColor
import _root_.chess.IntRating
import ligo.gorules.Setup as GoSetup
import alleycats.Zero

import scalalib.bus.NotBuseable

import lila.core.game.ClockSettings
import lila.core.perf.PerfKey
import lila.core.rating.RatingRange
import lila.core.socket.Sri
import lila.core.userId.*
import lila.core.id.GameFullId

opaque type Blocking = Set[UserId]
object Blocking extends TotalWrapper[Blocking, Set[UserId]]:
  given Zero[Blocking] = Zero(Set.empty)

opaque type PoolConfigId = String
object PoolConfigId extends OpaqueString[PoolConfigId]

/* Whether a hook with this clock and Go setup would be a game of some pool (ADR 0022 §6). */
opaque type IsPoolCompatible = (ClockSettings, GoSetup) => Boolean
object IsPoolCompatible extends FunctionWrapper[IsPoolCompatible, (ClockSettings, GoSetup) => Boolean]

enum PoolFrom:
  case Socket, Api, Hook

case class PoolMember(
    userId: UserId,
    sri: Sri,
    from: PoolFrom,
    rating: IntRating,
    provisional: Boolean,
    ratingRange: Option[RatingRange],
    lame: Boolean,
    blocking: Blocking,
    rageSitCounter: Int = 0,
    misses: Int = 0, // how many waves they missed
    // LiGo (ADR 0022 §2–§3, unit 6.4): the member's "Handicap OK / Even only" chip, and whether their rating
    // is a rank at all (false for an account still at lila's default 1500 / 500, which gets even games only)
    handicapOk: Boolean = false,
    rankKnown: Boolean = false
)

/* LiGo (ADR 0022 §4, unit 6.6): how many players wait in a pool, published by the pool whenever it changes;
 * the lobby passes it on to its viewers at most every 2 s. */
case class PoolSize(id: PoolConfigId, members: Int)

/* LiGo (ADR 0022 §4, unit 6.6): who a waiting player can meet now, for their tile: the unbroken run of ranks
 * around their own (names like "3k", "1d") and, with Handicap OK, the most stones among the ranks they can
 * reach (0 for even games only). */
case class PoolRange(sri: Sri, id: PoolConfigId, weakest: String, strongest: String, stones: Int)

case class Pairing(players: ByColor[(Sri, GameFullId)])
case class Pairings(pairings: List[Pairing])

object HookThieve:

  enum HookBus:
    case GetCandidates(clock: ClockSettings, go: GoSetup, promise: Promise[PoolHooks])
    case StolenHookIds(ids: Vector[String])

  case class PoolHook(hookId: String, member: PoolMember) extends NotBuseable

  case class PoolHooks(hooks: Vector[PoolHook]) extends NotBuseable

trait PoolApi:
  def setOnlineSris(ids: socket.Sris): Unit
  def poolPerfKeys: Map[PoolConfigId, PerfKey]
  def join(poolId: PoolConfigId, member: PoolMember): Unit
  def leave(poolId: PoolConfigId, user: UserId): Unit
  def poolOf(clock: ClockSettings, go: GoSetup): Option[PoolConfigId]
