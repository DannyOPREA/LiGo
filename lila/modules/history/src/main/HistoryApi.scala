package lila.history

import chess.Speed
import chess.IntRating
import reactivemongo.api.bson.*
import scalalib.model.Days

import lila.core.perf.UserPerfs
import lila.db.AsyncCollFailingSilently
import lila.db.dsl.{ *, given }

final class HistoryApi(
    withColl: AsyncCollFailingSilently,
    userApi: lila.core.user.UserApi,
    cacheApi: lila.memo.CacheApi
)(using Executor)
    extends lila.core.history.HistoryApi:

  import History.given

  lila.common.Bus.sub[lila.core.user.UserDelete]: del =>
    withColl(_.delete.one(bid(del.id)).void)

  def addPuzzle(user: User, completedAt: Instant, perf: lila.core.perf.Perf): Funit =
    withColl: coll =>
      val days = daysBetween(user.createdAt, completedAt)
      coll.update
        .one(
          bid(user.id),
          set(s"puzzle.$days" -> perf.intRating),
          upsert = true
        )
        .void

  def add(user: User, game: Game, perfs: UserPerfs): Funit = withColl: coll =>
    val changes = HistoryApi
      .perfKeysOf(isGo = true, PerfKey(game.ratingVariant, game.speed)) // every game is Go (unit 3.17)
      .map(pk => pk.value -> perfs(pk).intRating)
    val days = daysBetween(user.createdAt, game.movedAt)
    coll.update
      .one(
        bid(user.id),
        bdoc("$set" -> bdoc(changes.map: (perf, rating) =>
          (s"$perf.$days", bint(rating)))),
        upsert = true
      )
      .void

  // used for rating refunds
  def setPerfRating(user: User, perf: PerfKey, rating: IntRating): Funit = withColl: coll =>
    val days = daysBetween(user.createdAt, nowInstant)
    coll.update
      .one(
        bid(user.id),
        set(s"$perf.$days" -> bint(rating))
      )
      .void

  private def daysBetween(from: Instant, to: Instant): Int =
    scalalib.time.daysBetween(from.withTimeAtStartOfDay, to.withTimeAtStartOfDay)

  def get(userId: UserId): Fu[Option[History]] = withColl(_.one[History](bid(userId)))

  def ratingsMap[U: UserIdOf](user: U, perf: PerfKey): Fu[RatingsMap] =
    withColl(_.primitiveOne[RatingsMap](bid(user.id), perf.value).dmap(~_))

  def progresses(
      users: List[lila.core.user.WithPerf],
      perfKey: PerfKey,
      days: Days
  ): Fu[List[PairOf[IntRating]]] =
    withColl:
      _.optionsByOrderedIds[Bdoc, UserId](
        users.map(_.id),
        bdoc(perfKey.value -> true).some
      )(_.getAsTry[UserId]("_id").get).map { hists =>
        import History.ratingsReader
        users.zip(hists).map { (user, doc) =>
          val current = user.perf.intRating
          val previousDate = daysBetween(user.createdAt, nowInstant.minusDays(days.value))
          val previous =
            doc
              .flatMap(_.child(perfKey.value))
              .flatMap(ratingsReader.readOpt)
              .fold(current): hist =>
                hist.foldLeft(hist.headOption.fold(current)(_._2)):
                  case (_, (d, r)) if d < previousDate => r
                  case (acc, _) => acc
          previous -> current
        }
      }

  def lastWeekTopRating(user: UserId, perf: PerfKey): Fu[IntRating] = lastWeekTopRatingCache.get(user -> perf)

  private val lastWeekTopRatingCache = cacheApi[(UserId, PerfKey), IntRating](1024, "lastWeekTopRating"):
    _.expireAfterAccess(20.minutes).buildAsyncFuture: (userId, perf) =>
      userApi
        .withIntRatingIn(userId, perf)
        .orFail(s"No such user: $userId")
        .flatMap: (user, currentRating) =>
          val firstDay = daysBetween(user.createdAt, nowInstant.minusWeeks(1))
          val days = (firstDay to (firstDay + 6)).toList
          val project = bdoc:
            ("_id" -> BSONBoolean(false)) :: days.map: d =>
              s"$perf.$d" -> BSONBoolean(true)
          withColl(_.find(bid(user.id), project.some).one[Bdoc].map {
            _.flatMap:
              _.child(perf.value).map {
                _.elements.foldLeft(currentRating):
                  case (max, BSONElement(_, BSONInteger(v))) if max < IntRating(v) => IntRating(v)
                  case (max, _) => max
              }
          }).dmap(_ | currentRating)

object HistoryApi:

  /* The perfs a rated game gives a history point to. LiGo (unit 5.6): a Go game moves only the go
   * perf (ADR 0021 §1), so only its history gets a point, not chess's standard and speed perfs. */
  def perfKeysOf(isGo: Boolean, chessKey: PerfKey): List[PerfKey] =
    if isGo then List(PerfKey.go)
    else if Speed.all.exists(PerfKey.standardBySpeed(_) == chessKey) then List(PerfKey.standard, chessKey)
    else List(chessKey)
