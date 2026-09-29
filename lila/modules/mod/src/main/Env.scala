package lila.mod

import org.apache.pekko.actor.*
import com.softwaremill.macwire.*
import play.api.Configuration

import lila.common.Bus
import lila.core.config.*
import lila.core.report.SuspectId
import lila.core.mod.{ BoardApiMark, LoginWithWeakPassword, LoginWithBlankedPassword }
import lila.common.autoconfig.given

@Module
final class Env(
    appConfig: Configuration,
    db: lila.db.Db,
    perfStat: lila.core.perf.PerfStatApi,
    settingStore: lila.memo.SettingStore.Builder,
    reportApi: lila.report.ReportApi,
    lightUserApi: lila.user.LightUserApi,
    gameRepo: lila.game.GameRepo,
    userRepo: lila.user.UserRepo,
    userApi: lila.user.UserApi,
    userJsonView: lila.user.JsonView,
    perfsRepo: lila.user.UserPerfsRepo,
    notifyApi: lila.core.notify.NotifyApi,
    historyApi: lila.core.history.HistoryApi,
    prefApi: lila.core.pref.PrefApi,
    rankingApi: lila.user.RankingApi,
    noteApi: lila.user.NoteApi,
    cacheApi: lila.memo.CacheApi,
    ircApi: lila.core.irc.IrcApi,
    langPicker: lila.core.i18n.LangPicker
)(using Executor, Scheduler, lila.core.i18n.Translator, org.apache.pekko.stream.Materializer):

  val mailerEventsUrl = appConfig.get[Url]("mailer.events.url")

  private lazy val logRepo = ModlogRepo(db(CollName("modlog")))
  private lazy val historyRepo = HistoryRepo(db(CollName("mod_gaming_history")))

  lazy val presets = wire[ModPresetsApi]

  lazy val logApi = wire[ModlogApi]

  lazy val impersonate = wire[ImpersonateApi]

  private lazy val notifier = wire[ModNotifier]

  private lazy val ratingRefund = wire[RatingRefund]

  lazy val api: ModApi = wire[ModApi]

  lazy val gamify = wire[Gamify]

  lazy val search = wire[ModUserSearch]

  lazy val inquiryApi = wire[InquiryApi]

  lazy val stream = wire[ModStream]

  lazy val ipRender = wire[IpRender]

  private lazy val sandbagWatch = wire[SandbagWatch]

  Bus.sub[lila.core.game.FinishGame]:
    case lila.core.game.FinishGame(game, users) if !game.aborted =>
      // The engine assessment that also ran here went with the evaluation module (unit 3.5).
      if users.forall(_.exists(_.enabled.yes)) then sandbagWatch(game)
      if game.status == chess.Status.Cheat then
        game.loserUserId.foreach: userId =>
          logApi.cheatDetectedAndCount(userId, game.id).flatMap { count =>
            (count >= 3).so:
              if game.hasClock then
                api.autoEngine(
                  SuspectId(userId),
                  s"Cheat detected during game, ${count} times"
                )(using UserId.lichessAsMe)
              else reportApi.autoCheatDetectedReport(userId, count)
          }

  // publicChat (broadcast "Public Chats" deletion on DeletePublicChats) removed with the relay
  // module (unit 3.3).

  Bus.sub[lila.core.mod.AutoWarning]: warn =>
    logApi.modMessage(warn.userId, warn.subject)(using UserId.lichessAsMe)

  Bus.sub[lila.core.mod.SelfReportMark]:
    case lila.core.mod.SelfReportMark(suspectId, name, gameId) =>
      val msg = s"Self report: ${name} on https://lichess.org/${gameId}"
      api.autoEngine(SuspectId(suspectId), msg)(using UserId.lichessAsMe)

  Bus.sub[lila.core.mod.ChatTimeout]:
    case lila.core.mod.ChatTimeout(mod, user, reason, text) =>
      logApi.chatTimeout(user, reason, text)(using mod.into(MyId))

  Bus.sub[LoginWithWeakPassword]: l =>
    logApi.loginWithWeakPassword(l.userId)

  Bus.sub[LoginWithBlankedPassword]: l =>
    logApi.loginWithBlankedPassword(l.userId)

  Bus.sub[BoardApiMark]: m =>
    api.autoEngine(SuspectId(m.userId), s"Board API: ${m.name}")(using UserId.lichessAsMe)
