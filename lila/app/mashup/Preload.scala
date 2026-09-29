package lila.app
package mashup

import play.api.libs.json.*

import lila.core.game.Game
import lila.core.perf.UserWithPerfs
import lila.playban.TempBan
import lila.streamer.LiveStreams
import lila.timeline.Entry
import lila.user.{ LightUserApi, Me, User }
import lila.mon.extensions.*
import lila.round.UrgentGames

final class Preload(
    tv: lila.tv.Tv,
    gameRepo: lila.game.GameRepo,
    perfsRepo: lila.user.UserPerfsRepo,
    timelineApi: lila.timeline.EntryApi,
    liveStreamApi: lila.streamer.LiveApi,
    dailyPuzzle: lila.puzzle.DailyPuzzle.Try,
    lobbyApi: lila.api.LobbyApi,
    playbanApi: lila.playban.PlaybanApi,
    lightUserApi: LightUserApi,
    roundProxy: lila.round.GameProxyRepo,
    getLastUpdates: lila.feed.Feed.GetLastUpdates
)(using Executor):

  import Preload.*

  def apply(
      streamerSpots: Int
  )(using ctx: Context): Fu[Homepage] = for
    withPerfs <- ctx.user.traverse(perfsRepo.withPerfs)
    given Option[UserWithPerfs] = withPerfs
    // The blog carousel, the "unread message from Lichess" notice and the class list went with
    // the ublog, msg and clas modules (unit 3.6).
    (((((((data, povs), feat), entries), puzzle), streams), playban), blindGames) <-
      lobbyApi.get
        .mon(lila.mon.lobby.segment("lobbyApi"))
        .zip(tv.getBestGame.mon(lila.mon.lobby.segment("tvBestGame")))
        .zip((ctx.userId.so(timelineApi.userEntries)).mon(lila.mon.lobby.segment("timeline")))
        .zip((ctx.noBot.so(dailyPuzzle())).mon(lila.mon.lobby.segment("puzzle")))
        .zip(
          ctx.kid.no.so(
            liveStreamApi.all
              .dmap(_.homepage(streamerSpots, ctx.acceptLanguages).withTitles(lightUserApi))
              .mon(lila.mon.lobby.segment("streams"))
          )
        )
        .zip((ctx.userId.so(playbanApi.currentBan)).mon(lila.mon.lobby.segment("playban")))
        .zip(ctx.blind.so(ctx.me).so(roundProxy.urgentGames))
    (currentGame, _) <- ctx.me
      .soUse(currentGameMyTurn(povs, lightUserApi.sync))
      .mon(lila.mon.lobby.segment("currentGame"))
      .zip:
        lightUserApi
          .preloadMany(entries.flatMap(_.userIds).toList)
          .mon(lila.mon.lobby.segment("lightUsers"))
  yield Homepage(
    data,
    entries,
    feat,
    puzzle,
    streams,
    playban,
    currentGame,
    blindGames,
    getLastUpdates(),
    withPerfs
  )

  def currentGameMyTurn(using me: Me): Fu[Option[CurrentGame]] =
    gameRepo
      .playingRealtimeNoAi(me)
      .flatMap:
        _.map { roundProxy.pov(_, me) }.parallel.dmap(_.flatten)
      .flatMap:
        currentGameMyTurn(_, lightUserApi.sync)

  private def currentGameMyTurn(povs: List[Pov], lightUser: lila.core.LightUser.GetterSync)(using
      me: Me
  ): Fu[Option[CurrentGame]] =
    ~povs.collectFirst:
      case p1 if p1.game.nonAi && p1.game.hasClock && p1.isMyTurn =>
        roundProxy.pov(p1.gameId, me).dmap(_ | p1).map { pov =>
          val opponent = lila.game.Namer.playerTextBlocking(pov.opponent)(using lightUser)
          CurrentGame(pov = pov, opponent = opponent).some
        }

object Preload:

  case class Homepage(
      data: JsObject,
      userTimeline: Vector[Entry],
      featured: Option[Game],
      puzzle: Option[lila.puzzle.DailyPuzzle.WithHtml],
      streams: LiveStreams.WithTitles,
      playban: Option[TempBan],
      currentGame: Option[Preload.CurrentGame],
      blindGames: UrgentGames,
      lastUpdates: List[lila.feed.Feed.Update],
      me: Option[UserWithPerfs]
  )

  case class CurrentGame(pov: Pov, opponent: String)
