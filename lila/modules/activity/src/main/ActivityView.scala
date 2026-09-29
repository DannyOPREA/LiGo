package lila.activity

import lila.activity.activities.*
import lila.core.game.LightPov
import lila.core.rating.Score

case class ActivityView(
    interval: TimeInterval,
    games: Option[Games] = None,
    puzzles: Option[Puzzles] = None,
    storm: Option[Storm] = None,
    racer: Option[Racer] = None,
    streak: Option[Streak] = None,
    patron: Option[Patron] = None,
    corresMoves: Option[(Int, List[LightPov])] = None,
    corresEnds: Option[Map[PerfKey, (Score, List[LightPov])]] = None,
    follows: Option[Follows] = None,
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
    corresMoves,
    corresEnds,
    follows
  ).forall(_.isEmpty)
