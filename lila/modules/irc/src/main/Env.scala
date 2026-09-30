package lila.irc

import com.softwaremill.macwire.*
import play.api.libs.ws.StandaloneWSClient
import play.api.{ Configuration, Mode }

import lila.common.{ Bus, Lilakka }
import lila.core.misc.puzzle.DailyChange

@Module
final class Env(
    appConfig: Configuration,
    noteApi: lila.core.user.NoteApi,
    ws: StandaloneWSClient,
    shutdown: org.apache.pekko.actor.CoordinatedShutdown,
    mode: Mode,
    lightUser: lila.core.LightUser.GetterSyncFallback,
    net: lila.core.config.NetConfig
)(using Executor):

  import ZulipClient.given
  private val zulipConfig = appConfig.get[ZulipClient.Config]("zulip")
  private lazy val zulipClient = wire[ZulipClient]

  lazy val api: IrcApi = wire[IrcApi]

  if mode.isProd then
    api.publishInfo("Lichess has started!")
    Lilakka.shutdown(shutdown, _.PhaseBeforeServiceUnbind, "Tell IRC"): () =>
      api.stop()
      funit // don't wait for zulip aknowledgment to restart lila.

  Bus.sub[DailyChange](e => api.dailyPuzzle(e.id))
