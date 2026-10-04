package lila.round

import ligo.gorules.{ CountVersion, Point }
import play.api.libs.json.JsObject

import lila.common.Bus
import lila.core.round.ClientError
import lila.game.GameRepo
import lila.game.GoScoringPlay
import lila.game.GoScoringPlay.{ Ending, Reply, Step }

/** The round's side of a Go game's scoring phase (ADR 0020 §3–4, unit 4.8): it applies `GoScoringPlay`'s
  * steps to the game in play, sends their requests to the scoring service, keeps the phase's deadlines and
  * re-sends unanswered requests, and ends the game through the `Finisher`.
  */
final private class GoScorer(
    finisher: Finisher,
    gameRepo: GameRepo,
    // publish a request on `scoring-in`
    send: JsObject => Unit,
    // tell a round something later
    schedule: (GameId, FiniteDuration, Matchable) => Unit
)(using Executor):

  import GoScorer.*

  // the refs with a re-send already scheduled, so each unanswered request has one timer at a time
  private val resending = scala.collection.concurrent.TrieMap.empty[String, Unit]
  // the deadline each game's expiry timer is set for, so a deadline gets one timer however often it is met
  private val expiring = scala.collection.concurrent.TrieMap.empty[GameId, Instant]

  /** After a Go move: the second pass, or the move cap, opens the phase. */
  def afterMove(game: Game)(using GameProxy): Option[Fu[Events]] =
    GoScoringPlay.open(game, nowInstant).map(apply)

  def toggle(pov: Pov, at: Point, seen: CountVersion)(using GameProxy): Fu[Events] =
    orRefuse(pov, GoScoringPlay.toggle(pov.game, at, seen))

  def accept(pov: Pov, seen: CountVersion)(using GameProxy): Fu[Events] =
    orRefuse(pov, GoScoringPlay.accept(pov.game, pov.color, seen))

  def resume(pov: Pov)(using GameProxy): Fu[Events] =
    orRefuse(pov, GoScoringPlay.resume(pov.game, nowInstant))

  def reply(game: Game, reply: Reply)(using GameProxy): Fu[Events] = reply match
    case r: Reply.Counted =>
      GoScoringPlay.counted(game, r, nowInstant) match
        case Right(step) => apply(step)
        case Left(why) =>
          logger.info(s"Scoring reply ${r.ref} dropped: $why")
          fuccess(Nil)
    case Reply.Failed(ref, message) =>
      // a request the service couldn't read: a bug on one side or the other. The phase's deadline still
      // ends the game if no answer ever comes (ADR 0020 §4).
      logger.warn(s"Scoring service error for ${ref.fold("?")(_.toString)}: $message")
      fuccess(Nil)
    case Reply.Start => fuccess(Nil)

  /** The phase's deadline may have passed. */
  def expire(game: Game)(using GameProxy): Fu[Events] =
    expiring.remove(game.id)
    GoScoringPlay.expire(game, nowInstant).fold(fuccess(Nil))(apply)

  /** The round was loaded, the service restarted, or a re-send is due: send the request still unanswered, if
    * any, and keep the deadline's timer.
    */
  def wake(game: Game, ref: Option[String] = None): Unit =
    ref.foreach(resending.remove)
    for
      request <- GoScoringPlay.request(game)
      r <- requestRef(request)
      if ref.forall(_ == r)
    do
      send(request)
      scheduleResend(game.id, r)
    if ref.isEmpty then scheduleExpiry(game)

  private def orRefuse(pov: Pov, step: Either[String, Step])(using GameProxy): Fu[Events] =
    step.fold(why => fufail(ClientError(s"$pov scoring: $why")), apply)

  private def apply(step: Step)(using proxy: GameProxy): Fu[Events] =
    val game = step.game
    for
      _ <- proxy.save(step.progress)
      _ = step.request.foreach: request =>
        send(request)
        requestRef(request).foreach(scheduleResend(game.id, _))
      ended <- step.ending match
        case Some(ending @ Ending.Scored(_)) => finisher.other(game, _.VariantEnd, ending.winner)
        case Some(Ending.NoCount) => finisher.other(game, _.UnknownFinish, None)
        case None =>
          scheduleExpiry(game)
          game.goScoring
            .filter(_ => game.playable)
            .so(sc => gameRepo.setCheckAt(game, checkAt(sc, nowInstant)))
            .inject(Nil)
      _ = if step.ending.isEmpty then GoScorer.publishCorres(step.progress.origin, game)
    yield step.progress.events ::: ended

  private def requestRef(request: JsObject): Option[String] = (request \ "ref").asOpt[String]

  private def scheduleResend(gameId: GameId, ref: String): Unit =
    if resending.putIfAbsent(ref, ()).isEmpty then schedule(gameId, resendDelay, Resend(ref))

  private def scheduleExpiry(game: Game): Unit =
    game.goScoring
      .filter(_ => game.playable)
      .foreach: sc =>
        if !expiring.put(game.id, sc.expiresAt).contains(sc.expiresAt) then
          val millis = sc.expiresAt.toMillis - nowMillis
          schedule(game.id, (millis.max(0) + 1000).millis, Expiry)

object GoScorer:

  /** What a step of the phase means for a correspondence game's alarms and notifications (ADR 0023 §4). */
  enum CorresStep:
    /** The proposal arrived: the phase's day starts. */
    case Opened

    /** Who has accepted the count changed (an accept, or a toggle clearing the accepts). */
    case Changed

    /** Play resumed. Not a move in lila, but published as one (below), so the day-clock alarm and the "your
      * turn" push start again, with nobody credited in the activity feed.
      */
    case Resumed

  def corresStep(before: Game, after: Game): Option[CorresStep] =
    if !after.isCorrespondence || after.hasAi || !after.playable then None
    else
      (before.goScoring, after.goScoring) match
        case (Some(b), Some(a)) if b.proposal.isEmpty && a.proposal.isDefined => Some(CorresStep.Opened)
        case (Some(b), Some(a)) if b.accepted != a.accepted => Some(CorresStep.Changed)
        case (Some(_), None) => Some(CorresStep.Resumed)
        case _ => None

  private[round] def publishCorres(before: Game, after: Game): Unit =
    import lila.core.round.*
    import RoundGame.*
    corresStep(before, after).foreach:
      case CorresStep.Opened => Bus.pub(GoScoringOpened(after.id))
      case CorresStep.Changed => Bus.pub(GoScoringChanged(after.id))
      case CorresStep.Resumed =>
        Bus.pub:
          CorresMoveEvent(
            MoveEvent(after.id, lila.core.game.GoBridge.board(after.go), "resume"),
            playerUserId = None,
            mobilePushable = after.mobilePushable,
            alarmable = after.alarmable,
            unlimited = after.isUnlimited
          )

  /** lila re-sends an unanswered request this often (ADR 0020 §1, §4). */
  val resendDelay = 30.seconds

  /** When Titivate should look at a game in the scoring phase (its `ck`): at the deadline, and every minute
    * while a request is unanswered, so a round nobody has loaded since a lila restart still re-sends it (ADR
    * 0020 §1–2).
    */
  def checkAt(sc: lila.core.game.GoScoring, now: Instant): Instant =
    if sc.outstanding && sc.expiresAt.isAfter(now.plusMinutes(1)) then now.plusMinutes(1) else sc.expiresAt

  // the round's messages (RoundAsyncActor)
  case class Toggle(playerId: GamePlayerId, at: Point, seen: CountVersion)
  case class Accept(playerId: GamePlayerId, seen: CountVersion)
  case class Resume(playerId: GamePlayerId)
  case class ServiceReply(reply: Reply)
  case object Wake
  case class Resend(ref: String)
  case object Expiry

  /** A toggle's or accept's count version as players send it: `<phase>:<request>`. */
  def readVersion(s: String): Option[CountVersion] = s.split(':') match
    case Array(phase, request) =>
      for
        p <- phase.toIntOption
        r <- request.toIntOption
      yield CountVersion(p, r)
    case _ => None
