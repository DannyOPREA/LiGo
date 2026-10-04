package lila.round

import reactivemongo.pekkostream.cursorProducer
import reactivemongo.api.bson.*

import lila.common.{ Bus, LilaScheduler, LilaStream }
import lila.core.user.LightUserApi
import lila.db.dsl.{ *, given }
import lila.mon.extensions.*

final private class CorresAlarm(
    coll: Coll,
    hasUserId: (Game, UserId) => Fu[Boolean],
    proxyGame: GameId => Fu[Option[Game]],
    lightUser: LightUserApi
)(using Executor, Scheduler, org.apache.pekko.stream.Materializer):

  // A game has one alarm for the player to move (`_id` is the game id). In the scoring phase (ADR 0023 §4)
  // each player who hasn't accepted the count has their own, `<game id>:w` or `:b`, with `color` set.
  private case class Alarm(
      _id: String,
      ringsAt: Instant, // when to notify the player
      expiresAt: Instant,
      color: Option[Boolean] = None // scoring-phase alarms: true for White
  ):
    def gameId = GameId(_id.takeWhile(_ != ':'))

  private given BSONDocumentHandler[Alarm] = Macros.handler

  private def scoringId(id: GameId, color: Color) = s"$id:${color.letter}"

  private def deleteAll(id: GameId) =
    coll.delete
      .one(bdoc("_id".in(List(id.value, scoringId(id, Color.White), scoringId(id, Color.Black)))))
      .void

  Bus.sub[lila.core.game.FinishGame] { case lila.core.game.FinishGame(game, _) =>
    if game.hasCorrespondenceClock && !game.hasAi then deleteAll(game.id)
  }

  private def setDayAlarm(game: Game): Funit =
    game.playableCorrespondenceClock.ifTrue(game.bothPlayersHaveMoved && !game.inGoScoring).so { clock =>
      val remainingSeconds = clock.remainingTime(game.turnColor)
      val ringsAt = nowInstant.plusSeconds(remainingSeconds.toInt * 8 / 10)
      coll.update
        .one(
          bid(game.id),
          Alarm(
            _id = game.id.value,
            ringsAt = ringsAt,
            expiresAt = nowInstant.plusSeconds(remainingSeconds.toInt * 2)
          ),
          upsert = true
        )
        .void
    }

  Bus.sub[lila.core.round.CorresMoveEvent] { case lila.core.round.CorresMoveEvent(move, _, _, true, _) =>
    proxyGame(move.gameId).foreach:
      _.foreach(setDayAlarm)
  }

  /** The proposal arrived: the phase's day starts. The day-clock alarm goes, every player gets the
    * scoring-phase notification and push (instead of "It's your turn"), and alarms are set.
    */
  Bus.sub[lila.core.round.GoScoringOpened] { case lila.core.round.GoScoringOpened(gameId) =>
    proxyGame(gameId).foreach:
      _.filter(_.inGoScoring).foreach: game =>
        for
          _ <- coll.delete.one(bid(game.id))
          _ <- syncScoringAlarms(game)
        yield game.players.foreach: player =>
          player.userId.foreach: userId =>
            val pov = Pov(game, player.color)
            lila.game.Namer
              .playerText(pov.opponent)(using lightUser.async)
              .foreach: opponent =>
                Bus.pub(lila.core.game.ScoringPhaseEvent(userId, pov, opponent))
  }

  Bus.sub[lila.core.round.GoScoringChanged] { case lila.core.round.GoScoringChanged(gameId) =>
    proxyGame(gameId).foreach:
      _.filter(_.inGoScoring).foreach(syncScoringAlarms(_))
  }

  /** An alarm for each player who hasn't accepted the count, none for who has. */
  private def syncScoringAlarms(game: Game): Funit =
    game.goScoring.so: sc =>
      Color.all.sequentiallyVoid: color =>
        CorresAlarm.scoringRingsAt(sc, color, nowInstant) match
          case None => coll.delete.one(bid(scoringId(game.id, color))).void
          case Some((ringsAt, expiresAt)) =>
            coll.update
              .one(
                bid(scoringId(game.id, color)),
                Alarm(scoringId(game.id, color), ringsAt, expiresAt, Some(color.white)),
                upsert = true
              )
              .void

  LilaScheduler("CorresAlarm", _.Every(10.seconds), _.AtMost(10.seconds), _.Delay(2.minutes)):
    def deleteAlarm(id: String) = coll.delete.one(bid(id)).void
    coll
      .find(bdoc("ringsAt".lt(nowInstant)))
      .cursor[Alarm]()
      .documentSource(200)
      .mapAsyncUnordered(4)(alarm => proxyGame(alarm.gameId).map(alarm -> _))
      .mapAsyncUnordered(4):
        case (alarm, Some(game)) =>
          // the player to ring: the one to move, or the scoring-phase alarm's own player. A stale alarm (a
          // phase resumed or accepted since, or a day-clock alarm of a game now in the phase) just goes.
          val color = alarm.color.fold(game.turnColor)(white => Color.fromWhite(white))
          val stale = alarm.color match
            case None => game.inGoScoring
            case Some(_) =>
              !game.goScoring.exists(sc =>
                game.playable && !sc.accepted(lila.core.game.GoBridge.goColor(color))
              )
          val pov = Pov(game, color)
          deleteAlarm(alarm._id).zip(
            if stale then fuFalse
            else
              pov.player.userId
                .fold(fuccess(true))(u => hasUserId(pov.game, u))
                .addEffect {
                  if _ then () // already looking at the game
                  else
                    pov.player.userId.so: userId =>
                      lila.game.Namer
                        .playerText(pov.opponent)(using lightUser.async)
                        .foreach: opponent =>
                          Bus.pub(lila.core.game.CorresAlarmEvent(userId, pov, opponent))
                }
          )
        case (alarm, None) => deleteAlarm(alarm._id)
      .runWith(LilaStream.sinkCount)
      .mon(lila.mon.round.alarm.time)
      .void

private object CorresAlarm:

  /** When a scoring-phase alarm rings for this player, and when it expires: 80% of what is left of the
    * phase's timeout, as lila's alarms ring at 80% of the time left on the day clock. None for a player who
    * has accepted the count, or when the phase has no proposal yet (its day hasn't started).
    */
  def scoringRingsAt(
      sc: lila.core.game.GoScoring,
      color: Color,
      now: Instant
  ): Option[(Instant, Instant)] =
    Option.when(sc.proposal.isDefined && !sc.accepted(lila.core.game.GoBridge.goColor(color))):
      val remaining = (sc.expiresAt.toEpochMilli - now.toEpochMilli).max(0)
      (now.plusMillis(remaining * 8 / 10), now.plusMillis(remaining * 2))
