package lila.lobby

import chess.IntRating
import chess.rating.RatingProvisional
import chess.variant.Variant
import chess.Rated
import play.api.libs.json.*
import scalalib.ThreadLocalRandom
import scalalib.model.Days

import lila.common.Json.given
import ligo.gorules.Setup as GoSetup

import lila.core.game.GoSetups
import lila.core.perf.UserWithPerfs
import lila.core.rating.RatingRange
import lila.rating.PerfType

// correspondence Go, persistent
case class Seek(
    _id: String,
    variant: Variant.Id, // always standard chess, carried unused until unit 3.17
    go: Option[GoSetup], // board size, ruleset and komi (unit 3.15); none on older seeks
    daysPerTurn: Option[Days],
    rated: Rated,
    user: LobbyUser,
    ratingRange: RatingRange,
    createdAt: Instant
):
  inline def id = _id

  val realVariant = Variant.orDefault(variant)

  def compatibleWith(h: Seek) =
    user.id != h.user.id &&
      compatibilityProperties == h.compatibilityProperties &&
      ratingRangeCompatibleWith(h) && h.ratingRangeCompatibleWith(this)

  private def ratingRangeCompatibleWith(s: Seek) =
    realRatingRange.forall(_.contains(s.rating))

  def goSetup: GoSetup = go | GoSetups.default

  private def compatibilityProperties = (variant, goSetup, rated, daysPerTurn)

  lazy val realRatingRange: Option[RatingRange] = ratingRange.ifNotDefault

  // Go's one perf (ADR 0021 §1)
  lazy val perfType = PerfType.Go

  def perf = user.perfAt(perfType)
  def rating = perf.rating

  def render: JsObject =
    Json
      .obj(
        "id" -> _id,
        "username" -> user.username,
        "rating" -> rating,
        "variant" -> Json.obj("key" -> realVariant.key),
        "perf" -> Json.obj("key" -> perfType.key),
        "mode" -> rated.id, // must keep BC
        "go" -> GoSetups.json(goSetup)
      )
      .add("days" -> daysPerTurn)
      .add("provisional" -> perf.provisional.yes)

object Seek:

  given UserIdOf[Seek] = _.user.id

  val idSize = 8
  def makeId = ThreadLocalRandom.nextString(idSize)

  def make(
      variant: chess.variant.Variant,
      go: GoSetup,
      daysPerTurn: Option[Days],
      rated: Rated,
      user: UserWithPerfs,
      ratingRange: RatingRange,
      blocking: lila.core.pool.Blocking
  ): Seek = Seek(
    _id = makeId,
    variant = variant.id,
    go = go.some,
    daysPerTurn = daysPerTurn,
    rated = rated,
    user = LobbyUser.make(user, blocking),
    ratingRange = ratingRange,
    createdAt = nowInstant
  )

  def renew(seek: Seek) = Seek(
    _id = makeId,
    variant = seek.variant,
    go = seek.go,
    daysPerTurn = seek.daysPerTurn,
    rated = seek.rated,
    user = seek.user,
    ratingRange = seek.ratingRange,
    createdAt = nowInstant
  )

  import reactivemongo.api.bson.*
  import lila.db.dsl.{ *, given }
  import lila.core.game.GoSetups.given
  private given BSONHandler[RatingRange] = tryHandler[RatingRange](
    { case BSONString(s) => RatingRange.parse(s).toTry(s"Invalid rating range: $s") },
    r => BSONString(r.toString)
  )
  given BSONHandler[LobbyPerf] = BSONIntegerHandler.as[LobbyPerf](
    b => LobbyPerf(IntRating(b.abs), RatingProvisional(b < 0)),
    x => x.rating.value * (if x.provisional.yes then -1 else 1)
  )
  private given BSONHandler[Map[PerfKey, LobbyPerf]] = typedMapHandlerIso[PerfKey, LobbyPerf]
  private[lobby] given BSONDocumentHandler[LobbyUser] = Macros.handler
  private[lobby] given BSONDocumentHandler[Seek] = Macros.handler
