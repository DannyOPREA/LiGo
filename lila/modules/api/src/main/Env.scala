package lila.api

import org.apache.pekko.actor.*
import com.softwaremill.macwire.*
import play.api.Mode

import lila.chat.{ GetLinkCheck, IsChatFresh }
import lila.common.Bus

@Module
final class Env(
    net: lila.core.config.NetConfig,
    db: lila.db.Db,
    securityEnv: lila.security.Env,
    mailerEnv: lila.mailer.Env,
    puzzleEnv: lila.puzzle.Env,
    gameEnv: lila.game.Env,
    chatEnv: lila.chat.Env,
    roundEnv: lila.round.Env,
    bookmarkApi: lila.bookmark.BookmarkApi,
    prefApi: lila.pref.PrefApi,
    playBanApi: lila.playban.PlaybanApi,
    userEnv: lila.user.Env,
    relationEnv: lila.relation.Env,
    analyseEnv: lila.analyse.Env,
    lobbyEnv: lila.lobby.Env,
    challengeEnv: lila.challenge.Env,
    socketEnv: lila.socket.Env,
    pushEnv: lila.push.Env,
    reportEnv: lila.report.Env,
    modEnv: lila.mod.Env,
    appealApi: lila.appeal.AppealApi,
    shutupEnv: lila.shutup.Env,
    // titleEnv and fideEnv removed with the title and fide modules (unit 3.3); PublicFideIdOf is
    // supplied directly, stubbed out in app/Env.scala.
    fideIdOf: lila.core.user.PublicFideIdOf,
    modLogApi: lila.mod.ModlogApi,
    activityWriteApi: lila.activity.ActivityWriteApi,
    webConfig: lila.web.WebConfig,
    manifest: lila.web.AssetManifest,
    tokenApi: lila.oauth.AccessTokenApi,
    activityRead: lila.activity.ActivityReadApi,
    activityJson: lila.activity.JsonView
)(using scheduler: Scheduler)(using
    Mode,
    Executor,
    ActorSystem,
    org.apache.pekko.stream.Materializer,
    lila.core.i18n.Translator
):

  export net.{ baseUrl, domain }

  lazy val userApi = wire[UserApi]

  export webConfig.apiToken
  lazy val gameApi = wire[GameApi]

  lazy val gameApiV2 = wire[GameApiV2]

  lazy val roundApi = wire[RoundApi]

  lazy val lobbyApi = wire[LobbyApi]

  lazy val eventStream = wire[EventStream]

  lazy val personalDataExport = wire[PersonalDataExport]

  lazy val accountTermination = wire[AccountTermination]

  lazy val anySearch = wire[AnySearch]

  lazy val modTimeline = wire[ModTimelineApi]

  lazy val cli = wire[Cli]

  lazy val mobile = wire[MobileApi]

  lazy val gameStreamByOauthOrigin = wire[GameStreamByOauthOrigin]

  private lazy val linkCheck = wire[LinkCheck]
  lazy val chatFreshness = wire[ChatFreshness]

  Bus.sub[GetLinkCheck]:
    case GetLinkCheck(line, source, promise) =>
      promise.completeWith(linkCheck(line, source))
  Bus.sub[IsChatFresh]:
    case IsChatFresh(source, promise) =>
      promise.completeWith(chatFreshness.of(source))
  Bus.sub[lila.core.security.GarbageCollect]: gc =>
    accountTermination.garbageCollect(gc.userId)
  Bus.sub[lila.core.playban.RageSitClose]: close =>
    accountTermination.lichessDisable(close.userId)

  lila.i18n.Registry.asyncLoadLanguages()

  scheduler.scheduleWithFixedDelay(1.minute, 1.minute): () =>
    lila.mon.bus.classifiers.update(lila.common.Bus.size())
    lila.mon.jvm.threads()
    // ensure the Lichess user is online
    socketEnv.remoteSocket.onlineUserIds.getAndUpdate(_ + UserId.lichess)
    userEnv.repo.setSeenAt(UserId.lichess)
