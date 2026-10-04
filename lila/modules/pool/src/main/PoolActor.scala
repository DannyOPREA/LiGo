package lila.pool

import org.apache.pekko.actor.*
import org.apache.pekko.pattern.pipe
import scalalib.ThreadLocalRandom

import lila.common.Bus
import lila.core.pool.{ HookThieve, PoolMember, PoolFrom, PoolRange, PoolSize }
import lila.core.socket.Sris

final private class PoolActor(
    config: PoolConfig,
    hookThieve: HookThieve,
    gameStarter: GameStarter
) extends Actor:

  import PoolActor.*

  var members = Vector.empty[PoolMember]

  private var lastPairedUserIds = Set.empty[UserId]

  var nextWave: Cancellable = scala.compiletime.uninitialized

  given Executor = context.dispatcher

  def scheduleWave() =
    nextWave = context.system.scheduler.scheduleOnce(
      config.wave.every + ThreadLocalRandom.nextInt(1000).millis,
      self,
      ScheduledWave
    )

  scheduleWave()

  def receive =

    case Join(joiner) if lastPairedUserIds(joiner.userId) =>
    // don't pair someone twice in a row, it's probably a client error

    case Join(joiner) =>
      members.find(m => joiner.userId.is(m.userId)) match
        case None =>
          members = members :+ joiner
          // #TODO #FIXME race condition. several full waves can be sent here.
          if members.sizeIs >= config.wave.players.value then self ! FullWave
          tellRange(joiner)
        case Some(existing)
            if existing.ratingRange != joiner.ratingRange || existing.handicapOk != joiner.handicapOk =>
          // LiGo: the Handicap OK chip can change while waiting too (ADR 0022 §2)
          val updated = existing.withRange(joiner.ratingRange).copy(handicapOk = joiner.handicapOk)
          members = members.map: m =>
            if m == existing then updated else m
          tellRange(updated)
        case _ => // no change
      publishSize()

    case Leave(userId) =>
      members
        .find(_.userId == userId)
        .foreach: member =>
          members = members.filterNot(_ == member)
      publishSize()

    case ScheduledWave =>
      monitor.scheduled(monId).increment()
      self ! RunWave

    case FullWave =>
      monitor.full(monId).increment()
      self ! RunWave

    case RunWave =>
      nextWave.cancel()
      // #TODO #FIXME race condition.
      hookThieve.candidates(config).pipeTo(self)

    case HookThieve.PoolHooks(hooks) =>
      monitor.withRange(monId).record(members.count(_.hasRange))

      val candidates = members ++ hooks.map(_.member)

      val pairings = MatchMaking(candidates, config.size.lines)

      val pairedMembers = pairings.flatMap(_.members)

      hookThieve.stolen(
        hooks.filter: h =>
          pairedMembers.exists(m => h.member.userId.is(m.userId)),
        monId
      )

      members = members.diff(pairedMembers).map(_.incMisses)

      gameStarter(config, pairings)

      monitor.candidates(monId).record(candidates.size)
      monitor.paired(monId).record(pairedMembers.size)
      monitor.missed(monId).record(members.size)
      pairings.foreach: p =>
        monitor.ratingDiff(monId).record(p.ratingDiff.value)

      lastPairedUserIds = pairedMembers.view.map(_.userId).toSet

      publishSize()
      members.foreach(tellRange)

      scheduleWave()

    // lila-ws sends us the list of sris currently connected through WS
    // so we can cleanup members that are not connected anymore
    case Sris(sris) =>
      members = members.filter: member =>
        member.from != PoolFrom.Socket || sris.contains(member.sri)
      publishSize()

  // LiGo (ADR 0022 §4, unit 6.6): the tile's waiting count, published when it changes
  private var lastSize = 0
  private def publishSize(): Unit =
    if members.size != lastSize then
      lastSize = members.size
      Bus.pub(PoolSize(config.id, lastSize))

  // LiGo (ADR 0022 §4, unit 6.6): the ranks a member waiting on the lobby page can meet now, sent after each
  // wave and when they join
  private def tellRange(member: PoolMember): Unit =
    if member.from == PoolFrom.Socket then
      GoPairing
        .waitingRange(GoPairing.Member(member, member.handicapOk, member.rankKnown), config.size.lines)
        .foreach: r =>
          Bus.pub(PoolRange(member.sri, config.id, r.weakest.name, r.strongest.name, r.maxStones))

  val monitor = lila.mon.lobby.pool.wave
  val monId = config.id.value.replace('+', '_')

private object PoolActor:

  case class Join(member: PoolMember) extends AnyVal
  case class Leave(userId: UserId) extends AnyVal

  case object ScheduledWave
  case object FullWave
  case object RunWave
