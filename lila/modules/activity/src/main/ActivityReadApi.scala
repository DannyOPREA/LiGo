package lila.activity

import chess.Speed.Correspondence

import lila.core.game.LightPov
import lila.db.AsyncCollFailingSilently
import lila.db.dsl.*
import lila.mon.extensions.*

final class ActivityReadApi(
    coll: AsyncCollFailingSilently,
    gameRepo: lila.core.game.GameRepo,
    getPracticeStudies: lila.core.practice.GetStudies,
    forumPostApi: lila.core.forum.ForumPostApi,
    ublogApi: lila.core.ublog.UblogApi,
    studyApi: lila.core.study.StudyApi,
    teamApi: lila.core.team.TeamApi,
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
    practiceStudies <- activities
      .exists(_.practice.isDefined)
      .optionFu(getPracticeStudies())
    views <- activities.sequentially: a =>
      one(practiceStudies, a).mon(lila.mon.user.segment("activity.view"))
    _ <- preloadAll(views)
  yield addSignup(u.createdAt, views)

  private def preloadAll(views: Seq[ActivityView]) =
    lightUserApi.preloadMany(views.flatMap(_.follows.so(_.allUserIds)))

  private def one(practiceStudies: Option[lila.core.practice.Studies], a: Activity): Fu[ActivityView] =
    for
      allForumPosts <- a.forumPosts.traverse: p =>
        forumPostApi
          .miniViews(p.value)
          .mon(lila.mon.user.segment("activity.posts"))
      hiddenForumTeamIds <- teamApi.filterHideForum(
        (~allForumPosts).flatMap(_.topic.possibleTeamId).distinct
      )
      forumPosts = allForumPosts.map(
        _.filterNot(_.topic.possibleTeamId.exists(hiddenForumTeamIds.contains))
      )
      ublogPosts <- a.ublogPosts
        .traverse: p =>
          ublogApi
            .liveLightsByIds(p.value)
            .mon(lila.mon.user.segment("activity.ublogs"))
        .dmap(_.filter(_.nonEmpty))
      practice =
        for
          p <- a.practice
          studies <- practiceStudies
        yield p.value.flatMap { (studyId, nb) =>
          studies(studyId).map(_ -> nb)
        }.toMap
      forumPostView = forumPosts
        .map: p =>
          p.groupBy(_.topic)
            .view
            .mapValues: posts =>
              posts.view.map(_.post).sortBy(_.createdAt).toList
            .toMap
        .filter(_.nonEmpty)
      corresMoves <- a.corres.so: corres =>
        getLightPovs(a.id.userId, corres.movesIn).dmap:
          _.map(corres.moves -> _)
      corresEnds <- a.corres.so: corres =>
        getLightPovs(a.id.userId, corres.end).dmap:
          _.map:
            _.groupBy(pov => PerfKey(pov.game.variant, Correspondence)).view
              .mapValues: groupedPovs =>
                (Score.make(groupedPovs) -> groupedPovs)
              .toMap
      studies <- a.studies
        .traverse: studies =>
          studyApi.publicIdNames(studies.value)
        .dmap(_.filter(_.nonEmpty))
    yield ActivityView(
      interval = a.interval,
      games = a.games,
      puzzles = a.puzzles,
      storm = a.storm,
      racer = a.racer,
      streak = a.streak,
      practice = practice,
      forumPosts = forumPostView,
      ublogPosts = ublogPosts,
      patron = a.patron,
      corresMoves = corresMoves,
      corresEnds = corresEnds,
      follows = a.follows,
      studies = studies,
      teams = a.teams,
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
