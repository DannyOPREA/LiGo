package lila.activity

import chess.Speed.Correspondence

import lila.core.game.LightPov
import lila.db.AsyncCollFailingSilently
import lila.db.dsl.*
import lila.mon.extensions.*

final class ActivityReadApi(
    coll: AsyncCollFailingSilently,
    gameRepo: lila.core.game.GameRepo,
    lightUserApi: lila.core.user.LightUserApi
)(using Executor):

  import BSONHandlers.{ *, given }

  def recentAndPreload(u: User): Fu[List[ActivityView]] = for
    activities <-
      coll(
        _.find(regexId(u.id))
          .sort(sort.desc("_id"))
          .cursor[Activity]()
          .list(Activity.recentNb)
      ).dmap(_.filterNot(_.isEmpty))
        .mon(lila.mon.user.segment("activity.raws"))
    views <- activities.sequentially: a =>
      one(a).mon(lila.mon.user.segment("activity.view"))
    _ <- preloadAll(views)
  yield addSignup(u.createdAt, views)

  private def preloadAll(views: Seq[ActivityView]) =
    lightUserApi.preloadMany(views.flatMap(_.follows.so(_.allUserIds)))

  // practice and study activity entries removed with the practice and study modules (unit 3.3);
  // forum posts, blog posts and teams with the forum, ublog and team modules (unit 3.6).
  private def one(a: Activity): Fu[ActivityView] =
    for
      corresMoves <- a.corres.so: corres =>
        getLightPovs(a.id.userId, corres.movesIn).dmap:
          _.map(corres.moves -> _)
      corresEnds <- a.corres.so: corres =>
        getLightPovs(a.id.userId, corres.end).dmap:
          _.map:
            _.groupBy: pov =>
              // a Go game's perf is `go` (unit 3.16); its `variant` is the unused chess default
              if pov.game.isGo then lila.core.game.GoBridge.perfKey
              else PerfKey(pov.game.variant, Correspondence)
            .view
              .mapValues: groupedPovs =>
                (Score.make(groupedPovs) -> groupedPovs)
              .toMap
    yield ActivityView(
      interval = a.interval,
      games = a.games,
      puzzles = a.puzzles,
      storm = a.storm,
      racer = a.racer,
      streak = a.streak,
      patron = a.patron,
      corresMoves = corresMoves,
      corresEnds = corresEnds,
      follows = a.follows,
      stream = a.stream
    )

  private def addSignup(at: Instant, recent: List[ActivityView]) =
    val (found, views) = recent.foldLeft(false -> List.empty[ActivityView]):
      case ((false, as), a) if a.interval.contains(at) => (true, as :+ a.copy(signup = true))
      case ((found, as), a) => (found, as :+ a)
    if !found && views.sizeIs < Activity.recentNb && nowInstant.minusDays(8).isBefore(at) then
      views :+ ActivityView(
        interval = TimeInterval(at.withTimeAtStartOfDay, at.withTimeAtStartOfDay.plusDays(1)),
        signup = true
      )
    else views

  private def getLightPovs(userId: UserId, gameIds: List[GameId]): Fu[Option[List[LightPov]]] =
    gameIds.nonEmpty.so:
      gameRepo.light
        .gamesFromSecondary(gameIds)
        .dmap:
          _.flatMap { LightPov(_, userId) }.nonEmptyOption
