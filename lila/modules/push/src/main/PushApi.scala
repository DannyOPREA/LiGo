package lila.push

import org.apache.pekko.actor.*
import play.api.libs.json.*
import scalalib.data.LazyFu

import lila.common.LilaFuture
import lila.core.LightUser
import lila.core.challenge.Challenge
import lila.core.misc.push.TourSoon
import lila.core.notify.{ NotificationContent, PrefEvent, NotifyAllows }
import lila.core.round.{ Tell, RoundBus, MoveEvent }
import lila.core.study.data.StudyName
import lila.core.net.LichessMobileVersion

final class PushApi(
    firebasePush: FirebasePush,
    webPush: BrowserWebPush,
    gameProxy: lila.core.game.GameProxy,
    roundJson: lila.core.round.RoundJson,
    gameRepo: lila.core.game.GameRepo,
    namer: lila.core.game.Namer,
    notifyAllows: lila.core.notify.GetNotifyAllows,
    lightUser: lila.core.LightUser.GetterFallback
)(using Executor, Scheduler):

  import PushApi.*
  import PushApi.Data.payload

  private[push] def notifyPush(to: Iterable[NotifyAllows], content: NotificationContent): Funit =
    import NotificationContent.*
    content match
      // private message and forum mention pushes went with the msg and forum modules (unit 3.6).
      case StreamStart(streamerId, streamerName) =>
        streamStart(to, streamerId, streamerName)
      case BroadcastRound(url, title, body) =>
        broadcastRound(to, url, title, body)
      case InvitedToStudy(invitedBy, studyName, studyId) =>
        lightUser(invitedBy).flatMap(luser => invitedToStudy(to.head, luser.titleName, studyName, studyId))
      case _ => funit

  private val offlineRoundNotif = Data.FirebaseMod.NotifOnly(_.filterNot(_._1 == "round")).some

  def finish(game: Game): Funit =
    if !game.isCorrespondence || game.hasAi then funit
    else
      game.userIds.sequentiallyVoid { userId =>
        Pov(game, userId).so: pov =>
          val data = LazyFu: () =>
            for
              nbMyTurn <- gameRepo.countWhereUserTurn(userId)
              opponent <- asyncOpponentName(pov)
            yield Data(
              title = pov.win match
                case Some(true) => "You won!"
                case Some(false) => "You lost."
                case _ if isVoid(game) => "Your game ended with no result"
                case _ => "It's a draw."
              ,
              body = s"Your game with $opponent is over.",
              key = Key.gameFinish,
              urgency = Urgency.VeryLow,
              payload = payload(userId)(
                "type" -> "gameFinish",
                "gameId" -> game.id.value,
                "fullId" -> pov.fullId.value
              ),
              mobileCompatible = LichessMobileVersion.zero.some,
              iosBadge = nbMyTurn.some,
              firebaseMod = offlineRoundNotif
            )
          for
            _ <- IfAway(pov)(maybePushNotif(userId, _.finish, PrefEvent.gameEvent, data))
            _ <- alwaysPushFirebaseData(userId, _.finish, data)
          yield ()
      }

  def move(move: MoveEvent): Funit =
    LilaFuture.delay(2.seconds):
      gameProxy
        .game(move.gameId)
        .flatMap:
          // no "It's your turn" for the second pass: the scoring phase's own push says it (ADR 0023 §4)
          _.filter(g => g.playable && !g.inGoScoring).so: game =>
            lastMoveText(game).so: sanMove =>
              game.povs.toList.sequentiallyVoid: pov =>
                pov.player.userId.so: userId =>
                  val data = LazyFu: () =>
                    for
                      _ <- gameProxy.flushIfPresent(
                        game.id
                      ) // ensure game is updated before we count user games
                      nbMyTurn <- gameRepo.countWhereUserTurn(userId)
                      opponent <- asyncOpponentName(pov)
                      payload <- corresGamePayload(pov, "gameMove", userId)
                    yield Data(
                      title = "It's your turn!",
                      body = moveBody(opponent, sanMove),
                      key = Key.gameMove,
                      urgency = if pov.isMyTurn then Urgency.Normal else Urgency.Low,
                      payload = payload,
                      mobileCompatible = LichessMobileVersion.zero.some,
                      iosBadge = nbMyTurn.some,
                      firebaseMod = offlineRoundNotif
                    )
                  for
                    _ <- pov.isMyTurn.so:
                      IfAway(pov)(maybePushNotif(userId, _.move, PrefEvent.gameEvent, data))
                    _ <- alwaysPushFirebaseData(userId, _.move, data)
                  yield ()

  def takebackOffer(gameId: GameId): Funit =
    LilaFuture.delay(1.seconds):
      gameProxy
        .game(gameId)
        .flatMap:
          _.filter(_.playable).so: game =>
            game.players
              .collect:
                case p if p.isProposingTakeback => Pov(game, game.opponent(p))
              .so { pov => // the pov of the receiver
                pov.player.userId.so: userId =>
                  val data = LazyFu: () =>
                    for
                      opponent <- asyncOpponentName(pov)
                      payload <- corresGamePayload(pov, "gameTakebackOffer", userId)
                    yield Data(
                      title = "Takeback offer",
                      body = s"$opponent proposes a takeback",
                      key = Key.gameTakebackOffer,
                      urgency = Urgency.Normal,
                      payload = payload,
                      mobileCompatible = LichessMobileVersion.zero.some,
                      firebaseMod = offlineRoundNotif
                    )
                  IfAway(pov)(maybePushNotif(userId, _.takeback, PrefEvent.gameEvent, data)) >>
                    alwaysPushFirebaseData(userId, _.takeback, data)
              }

  def drawOffer(gameId: GameId): Funit =
    LilaFuture.delay(1.seconds):
      gameProxy
        .game(gameId)
        .flatMap:
          _.filter(_.playable).so: game =>
            game.players
              .collect:
                case p if p.isOfferingDraw => Pov(game, game.opponent(p))
              .so { pov => // the pov of the receiver
                pov.player.userId.so: userId =>
                  val data = LazyFu: () =>
                    for
                      opponent <- asyncOpponentName(pov)
                      payload <- corresGamePayload(pov, "gameDrawOffer", userId)
                    yield Data(
                      title = "Draw offer",
                      body = s"$opponent offers a draw",
                      key = Key.gameDrawOffer,
                      urgency = Urgency.Normal,
                      payload = payload,
                      firebaseMod = offlineRoundNotif,
                      mobileCompatible = LichessMobileVersion.zero.some
                    )
                  IfAway(pov)(maybePushNotif(userId, _.draw, PrefEvent.gameEvent, data)) >>
                    alwaysPushFirebaseData(userId, _.draw, data)
              }

  def corresAlarm(pov: Pov): Funit =
    pov.player.userId.so: userId =>
      val data = LazyFu: () =>
        for
          opponent <- asyncOpponentName(pov)
          payload <- corresGamePayload(pov, "corresAlarm", userId)
        yield Data(
          title = "Time is almost up!",
          body =
            if pov.game.inGoScoring then s"The count in your game with $opponent stands if you don't answer"
            else s"You are about to lose on time against $opponent",
          key = Key.gameMove,
          urgency = Urgency.High,
          payload = payload,
          mobileCompatible = LichessMobileVersion.zero.some,
          firebaseMod = offlineRoundNotif
        )
      maybePushNotif(userId, _.corresAlarm, PrefEvent.gameEvent, data) >>
        alwaysPushFirebaseData(userId, _.corresAlarm, data)

  /** A correspondence Go game's scoring phase opened (ADR 0023 §4): sent instead of "It's your turn". */
  def scoringPhase(pov: Pov): Funit =
    pov.player.userId.so: userId =>
      val data = LazyFu: () =>
        for
          opponent <- asyncOpponentName(pov)
          payload <- corresGamePayload(pov, "scoringPhase", userId)
        yield Data(
          title = "Time to count the game",
          body = s"Check the dead stones and accept the score with $opponent",
          key = Key.gameScoring,
          urgency = Urgency.Normal,
          payload = payload,
          mobileCompatible = LichessMobileVersion.zero.some,
          firebaseMod = offlineRoundNotif
        )
      IfAway(pov)(maybePushNotif(userId, _.scoringPhase, PrefEvent.gameEvent, data)) >>
        alwaysPushFirebaseData(userId, _.scoringPhase, data)

  private def corresGamePayload(pov: Pov, typ: String, userId: UserId): Fu[Data.Payload] =
    roundJson
      .mobileOffline(pov.game, pov.fullId.anyId)
      .map: round =>
        payload(userId)(
          "type" -> typ,
          "gameId" -> pov.gameId.value,
          "fullId" -> pov.fullId.value,
          "round" -> Json.stringify(round)
        )

  def invitedToStudy(to: NotifyAllows, invitedBy: String, studyName: StudyName, studyId: StudyId): Funit =
    filterPushNotif(
      to,
      _.message,
      LazyFu.sync:
        Data(
          title = studyName.value,
          body = s"$invitedBy invited you to $studyName",
          key = Key.invitedStudy,
          urgency = Urgency.Normal,
          mobileCompatible = None,
          payload = payload(to.userId)(
            "type" -> "invitedStudy",
            "invitedBy" -> invitedBy,
            "studyName" -> studyName.value,
            "studyId" -> studyId.value,
            "url" -> s"https://lichess.org/study/$studyId"
          )
        )
    )

  def challengeCreate(c: Challenge): Funit =
    c.destUser.so: dest =>
      c.challengerUser
        .ifTrue(c.timeControl.clockSettings.isEmpty)
        .so: challenger =>
          lightUser(challenger.id).flatMap: lightChallenger =>
            maybePushNotif(
              dest.id,
              _.challenge.create,
              PrefEvent.challenge,
              LazyFu.sync:
                Data(
                  title = s"${lightChallenger.titleName} (${challenger.rating.show}) challenges you!",
                  body = describeChallenge(c),
                  key = Key.challengeCreate,
                  urgency = Urgency.Normal,
                  payload = payload(dest.id)(
                    "type" -> "challengeCreate",
                    "challengeId" -> c.id.value
                  ),
                  mobileCompatible = LichessMobileVersion(0, 18).some
                )
            )

  def challengeAccept(c: Challenge, game: Game, joinerId: Option[UserId]): Funit =
    c.challengerUser
      .ifTrue(c.finalColor.white && c.timeControl.clockSettings.isEmpty)
      .so: challenger =>
        joinerId
          .so(lightUser.optional)
          .flatMap: lightJoiner =>
            maybePushNotif(
              challenger.id,
              _.challenge.accept,
              PrefEvent.challenge,
              LazyFu.sync:
                Data(
                  title = s"${lightJoiner.fold("A player")(_.titleName)} accepts your challenge!",
                  body = describeChallenge(c),
                  key = Key.challengeAccept,
                  urgency = Urgency.Normal,
                  mobileCompatible = LichessMobileVersion(0, 18).some,
                  payload = payload(challenger.id)(
                    "type" -> "challengeAccept",
                    "challengeId" -> c.id.value,
                    "fullId" -> game.fullIdOf(c.finalColor).value
                  )
                )
            )

  def tourSoon(tour: TourSoon): Funit =
    tour.userIds.toList.sequentiallyVoid: userId =>
      maybePushNotif(
        userId,
        _.tourSoon,
        PrefEvent.tournamentSoon,
        LazyFu.sync:
          Data(
            title = tour.tourName,
            body = "The tournament is about to start!",
            key = Key.challengeAccept,
            urgency = Urgency.Normal,
            mobileCompatible = None,
            payload = payload(userId)(
              "type" -> "tourSoon",
              "tourId" -> tour.tourId,
              "tourName" -> tour.tourName,
              "path" -> s"/${if tour.swiss then "swiss" else "tournament"}/${tour.tourId}"
            )
          )
      )

  def streamStart(recips: Iterable[NotifyAllows], streamerId: UserId, streamerName: String): Funit =
    val pushData = LazyFu.sync:
      Data(
        title = streamerName,
        body = streamerName + " started streaming",
        key = Key.streamStart,
        urgency = Urgency.Low,
        payload = payload(
          "type" -> "streamStart",
          "streamerId" -> streamerId.value,
          "url" -> s"https://lichess.org/streamer/$streamerId/redirect"
        ),
        mobileCompatible = None
      )
    filterPushNotif(recips, _.streamStart, pushData)

  private type MonitorType = lila.mon.push.send.type => ((String, Boolean, Int) => Unit)

  private def broadcastRound(
      recips: Iterable[NotifyAllows],
      url: String,
      title: String,
      body: String
  ): Funit =
    val pushData = LazyFu.sync:
      Data(
        title = title,
        body = body,
        key = Key.broadcastRound,
        urgency = Urgency.Normal,
        payload = payload("type" -> "broadcast", "url" -> url),
        mobileCompatible = LichessMobileVersion(0, 27).some
      )
    filterPushNotif(recips, _.broadcastRound, pushData)

  def recap(userId: UserId, year: Int, title: String, body: String): Funit =
    val data = LazyFu.sync:
      Data(
        title = title,
        body = body,
        key = Key.recap,
        urgency = Urgency.Normal,
        payload = payload("type" -> "recap", "year" -> year.toString),
        mobileCompatible = LichessMobileVersion(0, 26).some
      )
    pushFirebase(userId, _.recap, data)

  private def maybePushNotif(
      userId: UserId,
      monitor: MonitorType,
      event: PrefEvent,
      data: LazyFu[Data]
  ): Funit =
    notifyAllows(userId, event).flatMap: allows =>
      filterPushNotif(NotifyAllows(userId, allows), monitor, data)

  private def filterPushNotif(to: NotifyAllows, monitor: MonitorType, data: LazyFu[Data]): Funit = for
    _ <- to.allows.web.so(webPush(to.userId, data).addEffects: res =>
      monitor(lila.mon.push.send)("web", res.isSuccess, 1))
    _ <- to.allows.device.so(firebasePush(to.userId, data).addEffects: res =>
      monitor(lila.mon.push.send)("firebase", res.isSuccess, 1))
  yield ()

  private def filterPushNotif(to: Iterable[NotifyAllows], monitor: MonitorType, data: LazyFu[Data]): Funit =
    val webRecips = to.collect { case u if u.allows.web => u.userId }
    val firebaseRecips = to.collect { case u if u.allows.device => u.userId }
    for
      _ <- webPush(webRecips, data).addEffects: res =>
        monitor(lila.mon.push.send)("web", res.isSuccess, webRecips.size)
      _ <- firebaseRecips.parallelVoid:
        firebasePush(_, data).addEffects: res =>
          monitor(lila.mon.push.send)("firebase", res.isSuccess, 1)
    yield ()

  private def pushFirebase(userId: UserId, monitor: MonitorType, data: LazyFu[Data]): Funit =
    firebasePush(userId, data).addEffects: res =>
      monitor(lila.mon.push.send)("firebaseData", res.isSuccess, 1)

  // ignores notification preferences
  private def alwaysPushFirebaseData(userId: UserId, monitor: MonitorType, data: LazyFu[Data]): Funit =
    firebasePush(userId, data.dmap(_.copy(firebaseMod = Data.FirebaseMod.DataOnly.some))).addEffects: res =>
      monitor(lila.mon.push.send)("firebaseData", res.isSuccess, 1)

  private def moveBody(opponent: String, move: String): String = move match
    case "pass" => s"$opponent passed"
    case "resume" => s"$opponent resumed play"
    case move => s"$opponent played $move"

  // A Go move as players read it (`D4`, `pass`) (unit 3.16).
  // a game that ended without a count (ADR 0020 §4): no result, not a draw
  private def isVoid(game: Game) = game.status == chess.Status.UnknownFinish && game.winnerColor.isEmpty

  private def lastMoveText(game: Game): Option[String] =
    game.go.actions.lastOption.map(lila.core.game.GoBridge.label(_, game.go.size.lines))

  private def describeChallenge(c: Challenge) =
    import lila.core.challenge.Challenge.TimeControl.*
    List(
      if c.rated.yes then "Rated" else "Casual",
      c.timeControl match
        case Unlimited => "Unlimited"
        case Correspondence(d) => s"$d days"
        case c: Clock => c.show
        case b: Byoyomi => b.show
      ,
      "Go"
    ).mkString(" • ")

  private def IfAway(pov: Pov)(f: => Funit): Funit =
    lila.common.Bus
      .ask[Boolean, Tell]: p =>
        Tell(pov.gameId, RoundBus.IsOnGame(pov.color, p))
      .flatMap:
        if _ then funit
        else f

  private def asyncOpponentName(pov: Pov): Fu[String] =
    namer.playerText(pov.opponent)(using lightUser.optional)

private object PushApi:

  case class Data(
      title: String,
      body: String,
      key: Key,
      urgency: Urgency,
      payload: Data.Payload,
      mobileCompatible: Option[LichessMobileVersion] = None,
      lichobileCompatible: Boolean = false,
      iosBadge: Option[Int] = None,
      // https://firebase.google.com/docs/cloud-messaging/customize-messages/set-message-type
      firebaseMod: Option[Data.FirebaseMod] = None
  )

  object Data:
    // firebase doesn't support nested data object
    type KeyValue = Seq[(String, String)]
    case class Payload(userId: Option[UserId], userData: KeyValue)
    def payload(userId: UserId)(pairs: (String, String)*): Payload = Payload(userId.some, pairs)
    def payload(pairs: (String, String)*): Payload = Payload(none, pairs)

    type KeyValueMod = Data.KeyValue => Data.KeyValue
    enum FirebaseMod(val mod: KeyValueMod):
      case NotifOnly(m: KeyValueMod) extends FirebaseMod(m)
      case DataOnly extends FirebaseMod(identity)
