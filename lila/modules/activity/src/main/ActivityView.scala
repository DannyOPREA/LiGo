package lila.activity

import lila.activity.activities.*
import lila.core.forum.{ ForumPostMini, ForumTopicMini }
import lila.core.game.LightPov
import lila.core.rating.Score
import lila.core.ublog.UblogPost

case class ActivityView(
    interval: TimeInterval,
    games: Option[Games] = None,
    puzzles: Option[Puzzles] = None,
    storm: Option[Storm] = None,
    racer: Option[Racer] = None,
    streak: Option[Streak] = None,
    patron: Option[Patron] = None,
    forumPosts: Option[Map[ForumTopicMini, List[ForumPostMini]]] = None,
    ublogPosts: Option[List[UblogPost.LightPost]] = None,
    corresMoves: Option[(Int, List[LightPov])] = None,
    corresEnds: Option[Map[PerfKey, (Score, List[LightPov])]] = None,
    follows: Option[Follows] = None,
    teams: Option[Teams] = None,
    stream: Boolean = false,
    signup: Boolean = false
):
  def isEmpty = !stream && List(
    games,
    puzzles,
    storm,
    racer,
    streak,
    patron,
    forumPosts,
    ublogPosts,
    corresMoves,
    corresEnds,
    follows,
    teams
  ).forall(_.isEmpty)
