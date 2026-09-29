package lila.activity

import lila.common.LichessDay

import activities.*

case class Activity(
    id: Activity.Id,
    games: Option[Games] = None,
    puzzles: Option[Puzzles] = None,
    storm: Option[Storm] = None,
    racer: Option[Racer] = None,
    streak: Option[Streak] = None,
    learn: Option[Learn] = None,
    corres: Option[Corres] = None,
    patron: Option[Patron] = None,
    follows: Option[Follows] = None,
    stream: Boolean = false
):

  def date = id.day.toInstant

  def interval = TimeInterval(date, date.plusDays(1))

  def isEmpty =
    !stream && List(
      games,
      puzzles,
      storm,
      racer,
      streak,
      learn,
      corres,
      patron,
      follows
    )
      .forall(_.isEmpty)

object Activity:

  val recentNb = 7

  case class Id(userId: UserId, day: LichessDay)
  def today(userId: UserId) = Id(userId, LichessDay.today)

  case class WithUserId(activity: Activity, userId: UserId)

  def make(userId: UserId) = Activity(today(userId))
