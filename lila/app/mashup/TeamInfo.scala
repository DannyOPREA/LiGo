package lila.app
package mashup

import lila.core.forum.ForumPostMiniView
import lila.team.{ Team, TeamMember }

case class TeamInfo(
    show: Team.TeamShow,
    forum: Option[List[ForumPostMiniView]]
):
  export show.{ leaders, publicLeaders }

  def userIds = forum.so(_.flatMap(_.post.userId))

final class TeamInfoApi(
    forumRecent: lila.forum.RecentTeamPosts,
    lightUserApi: lila.core.user.LightUserApi
)(using Executor):

  def apply(t: Team.TeamShow, withForum: Option[TeamMember] => Boolean): Fu[TeamInfo] = for
    forumPosts <- withForum(t.member).optionFu(forumRecent(t.team.id))
    _ <- lightUserApi.preloadMany:
      t.publicLeaders.map(_.user) ::: forumPosts.so(_.flatMap(_.post.userId))
  yield TeamInfo(t, forumPosts)
