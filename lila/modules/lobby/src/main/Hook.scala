package lila.lobby

import chess.variant.Variant
import chess.IntRating
import chess.{ Rated, Speed }
import play.api.libs.json.*
import scalalib.ThreadLocalRandom

import ligo.gorules.Setup as GoSetup

import lila.core.game.{ ClockSettings, GoSetups }
import lila.core.perf.UserWithPerfs
import lila.core.rating.RatingRange
import lila.core.socket.Sri
import lila.rating.PerfType
import lila.core.pool.IsPoolCompatible
import lila.core.id.SessionId

// realtime Go, volatile
case class Hook(
    id: String,
    sri: Sri, // owner socket sri
    sid: Option[SessionId], // owner cookie (used to prevent multiple hooks)
    variant: Variant.Id, // always standard chess, carried unused until unit 3.17
    go: GoSetup, // board size, ruleset and komi (unit 3.15)
    clock: ClockSettings, // Fischer or byo-yomi (unit 4.9)
    rated: Rated,
    color: TriColor,
    user: Option[LobbyUser],
    ratingRange: RatingRange,
    createdAt: Instant,
    boardApi: Boolean
):

  val realVariant = Variant.orDefault(variant)

  val isAuth = user.nonEmpty

  def compatibleWith(h: Hook) =
    isAuth == h.isAuth &&
      rated == h.rated &&
      variant == h.variant &&
      go == h.go &&
      clock == h.clock &&
      color.compatibleWith(h.color) &&
      ratingRangeCompatibleWith(h) && h.ratingRangeCompatibleWith(this) &&
      (userId.isEmpty || userId != h.userId)

  private def ratingRangeCompatibleWith(h: Hook) =
    !isAuth || h.rating.so(ratingRangeOrDefault.contains)

  lazy val manualRatingRange = isAuth.so(ratingRange.ifNotDefault)

  private def nonWideRatingRange =
    val r = rating | lila.rating.Glicko.default.intRating
    manualRatingRange.filter:
      _ != RatingRange(r - IntRating(500), r + IntRating(500))

  lazy val ratingRangeOrDefault: RatingRange =
    nonWideRatingRange.orElse(rating.map(lila.rating.RatingRange.defaultFor)).getOrElse(RatingRange.default)

  def userId = user.map(_.id)
  def username = user.fold(UserName.anonymous)(_.username)
  def lame = user.so(_.lame)

  // Go's one perf (ADR 0021 §1)
  lazy val perfType: PerfType = PerfType.Go

  lazy val perf: Option[LobbyPerf] = user.map(_.perfAt(perfType))
  def rating: Option[IntRating] = perf.map(_.rating)
  def provisional = perf.forall(_.provisional.yes)

  import lila.common.Json.given
  def render: JsObject = Json
    .obj(
      "id" -> id,
      "sri" -> sri,
      "clock" -> clock.show,
      "perf" -> perfType.key,
      "t" -> clock.estimateTotalSeconds,
      "s" -> speed.id,
      "i" -> (if clock.fischer.exists(_.incrementSeconds > 0) then 1 else 0)
    )
    .add("prov" -> perf.map(_.provisional))
    .add("u" -> user.map(_.username))
    .add("rating" -> rating)
    .add("goRank" -> perf.map(p => lila.rating.GoRating.label(p.rating, p.provisional))) // LiGo (unit 5.5)
    .add("variant" -> realVariant.exotic.option(realVariant.key))
    .add("go" -> GoSetups.json(go).some)
    .add("ra" -> rated.yes.option(1))
    .add("byo" -> clock.byoyomi.map: c =>
      Json.obj("limit" -> c.mainSeconds, "periods" -> c.periods, "period" -> c.periodSeconds))

  /* A pool game would have been rated, random colour, even, Japanese rules and the spec's komi
   * (ADR 0022 §6); the pool's board size and clock are checked against each pool below. Pools have
   * Fischer clocks until unit 6.4's second part brings byo-yomi ones. */
  def seemsCompatibleWithPools =
    rated.yes && realVariant.standard && color == TriColor.Random &&
      go.handicap == 0 && go.position.isEmpty && go.ruleset == ligo.gorules.Ruleset.Japanese &&
      GoSetups.hasStandardKomi(go)

  def compatibleWithPools(using isPoolCompatible: IsPoolCompatible) =
    seemsCompatibleWithPools && clock.fischer.exists(isPoolCompatible.exec(_, go))

  def compatibleWithPool(poolClock: chess.Clock.Config, poolGo: GoSetup) =
    clock.fischer.contains(poolClock) && go == poolGo && seemsCompatibleWithPools

  private lazy val speed = clock.speed

object Hook:

  val idSize = 8

  def make(
      sri: Sri,
      variant: chess.variant.Variant,
      go: GoSetup,
      clock: ClockSettings,
      rated: Rated,
      color: TriColor,
      user: Option[UserWithPerfs],
      sid: Option[SessionId],
      ratingRange: RatingRange,
      blocking: lila.core.pool.Blocking,
      boardApi: Boolean = false
  ): Hook =
    new Hook(
      id = ThreadLocalRandom.nextString(idSize),
      sri = sri,
      variant = variant.id,
      go = go,
      clock = clock,
      rated = rated,
      color = color,
      user = user.map(LobbyUser.make(_, blocking)),
      sid = sid,
      ratingRange = ratingRange,
      createdAt = nowInstant,
      boardApi = boardApi
    )

  import lila.core.pool.{ PoolFrom, PoolMember }
  def asPoolMember(h: Hook, from: PoolFrom) = h.user.map: u =>
    PoolMember(
      userId = u.id,
      sri = h.sri,
      from = from,
      rating = h.rating | lila.rating.Glicko.default.intRating,
      provisional = h.provisional,
      ratingRange = h.manualRatingRange,
      lame = h.user.so(_.lame),
      blocking = h.user.so(_.blocking),
      rageSitCounter = 0
    )

  def asPoolHook(h: Hook) =
    asPoolMember(h, PoolFrom.Hook).map:
      lila.core.pool.HookThieve.PoolHook(h.id, _)
