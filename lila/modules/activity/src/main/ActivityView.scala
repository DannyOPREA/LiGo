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
    practice: Option[Map[lila.core.practice.Study, Int]] = None,
    patron: Option[Patron] = None,
    forumPosts: Option[Map[ForumTopicMini, List[ForumPostMini]]] = None,
    ublogPosts: Option[List[UblogPost.LightPost]] = None,
    corresMoves: Option[(Int, List[LightPov])] = None,
    corresEnds: Option[Map[PerfKey, (Score, List[LightPov])]] = None,
    follows: Option[Follows] = None,
    studies: Option[List[lila.core.study.IdName]] = None,
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
    practice,
    patron,
    forumPosts,
    ublogPosts,
    corresMoves,
    corresEnds,
    follows,
    studies,
    teams
  ).forall(_.isEmpty)
