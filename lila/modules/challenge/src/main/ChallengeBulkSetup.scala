package lila.challenge

import cats.mtl.Handle.*
import org.apache.pekko.stream.scaladsl.*
import ligo.gorules.Setup as GoSetup
import chess.{ ByColor, Clock, Rated }
import play.api.data.*
import play.api.data.Forms.*
import play.api.libs.json.Json
import scalalib.ThreadLocalRandom
import scalalib.model.Days
import scalalib.net.Bearer

import lila.core.data.Template
import lila.core.game.{ GameRule, GoSetups }
import lila.core.setup.GoOptions
import lila.game.IdGenerator
import lila.oauth.{ EndpointScopes, OAuthScope, OAuthServer }
import lila.common.Form.into

final class ChallengeBulkSetup(setupForm: lila.core.setup.SetupForm):

  import ChallengeBulkSetup.*

  private def timestampInNearFuture = longNumber(
    min = 0,
    max = nowInstant.plusDays(7).toMillis
  )

  def form = Form[BulkFormData](
    mapping(
      "players" -> nonEmptyText
        .verifying("Not enough tokens", t => extractTokenPairs(t).nonEmpty)
        .verifying(s"Too many tokens (max: ${maxGames * 2})", t => extractTokenPairs(t).sizeIs <= maxGames),
      setupForm.variant,
      setupForm.clock,
      setupForm.optionalDays,
      "fen" -> setupForm.noFen,
      "rated" -> boolean.into[Rated],
      "pairAt" -> optional(timestampInNearFuture),
      "startClocksAt" -> optional(timestampInNearFuture),
      setupForm.message,
      setupForm.rules,
      setupForm.goSize,
      setupForm.goRuleset,
      setupForm.goKomi
    ) {
      (
          tokens: String,
          _: Option[String], // a chess variant, refused by the form (unit 3.17)
          clock: Option[Clock.Config],
          days: Option[Days],
          _: Option[String], // a chess position, refused by the form (unit 3.17)
          rated: Rated,
          pairTs: Option[Long],
          clockTs: Option[Long],
          message: Option[String],
          rules: Option[Set[GameRule]],
          size: Option[Int],
          ruleset: Option[String],
          komi: Option[Double]
      ) =>
        BulkFormData(
          tokens,
          clock,
          days,
          rated,
          pairTs.map(millisToInstant),
          clockTs.map(millisToInstant),
          message.map(Template.apply),
          ~rules,
          GoOptions(size, ruleset, komi)
        )
    }(_ => None)
      .verifying(
        "clock or correspondence days required",
        c => c.clock.isDefined || c.days.isDefined
      )
      // rated games on setups the rating maths covers (ADR 0021 §4, unit 5.7)
      .verifying(
        "A rated Go game needs a 9x9 or 19x19 board and the standard komi",
        c => c.rated.no || c.go.setup.exists(lila.core.game.GoSetups.canBeRated)
      )
      .verifying("Komi must be a multiple of 0.5 no bigger than the board", _.go.valid)
      .verifying(
        "Tokens must be unique for real-time games (not correspondence)",
        data =>
          data.allowMultiplePairingsPerUser || {
            val tokens = extractTokenPairs(data.tokens).view.flatMap { case (w, b) => Vector(w, b) }.toVector
            tokens.size == tokens.distinct.size
          }
      )
  )

final class ChallengeBulkSetupApi(
    oauthServer: OAuthServer,
    idGenerator: IdGenerator
)(using Executor, org.apache.pekko.stream.Materializer, lila.core.config.RateLimit):

  import ChallengeBulkSetup.*

  private val rateLimit = lila.memo.RateLimit[UserId](
    credits = maxGames * 3,
    duration = 10.minutes,
    key = "challenge.bulk"
  )

  def apply(data: BulkFormData, me: User): FuRaise[ScheduleError, ScheduledBulk] =
    Source(extractTokenPairs(data.tokens))
      .mapConcat: (whiteToken, blackToken) =>
        List(whiteToken, blackToken) // flatten now, re-pair later!
      .mapAsync(8): token =>
        allow:
          oauthServer
            .auth(token -> none, OAuthScope.select(_.Challenge.Write).into(EndpointScopes), none)
            .map(Right(_))
        .rescue: err =>
          fuccess(Left(BadToken(token, err)))
      .runFold[Either[List[BadToken], List[UserId]]](Right(Nil)):
        case (Left(bads), Left(bad)) => Left(bad :: bads)
        case (Left(bads), _) => Left(bads)
        case (Right(_), Left(bad)) => Left(bad :: Nil)
        case (Right(users), Right(scoped)) => Right(scoped.me.userId :: users)
      .flatMap:
        case Left(errors) => ScheduleError.BadTokens(errors.reverse).raise
        case Right(allPlayers) =>
          lazy val dups = allPlayers
            .groupBy(identity)
            .view
            .mapValues(_.size)
            .collect:
              case (u, nb) if nb > 1 => u
            .toList
          if !data.allowMultiplePairingsPerUser && dups.nonEmpty
          then ScheduleError.DuplicateUsers(dups).raise
          else
            val pairs = allPlayers.reverse
              .grouped(2)
              .collect { case List(w, b) => (w, b) }
              .toList
            val nbGames = pairs.size
            val cost = nbGames * (if me.isVerifiedOrChallengeAdmin || me.isApiHog then 1 else 3)
            rateLimit(me.id, ScheduleError.RateLimited.raise, cost = cost):
              lila.mon.api.challenge.bulk.scheduleNb(me.id).increment(nbGames)
              idGenerator
                .games(nbGames)
                .map(_.toList.zip(pairs))
                .map:
                  _.map:
                    case (id, (w, b)) => ScheduledGame(id, w, b)
                .dmap:
                  ScheduledBulk(
                    id = ThreadLocalRandom.nextString(8),
                    by = me.id,
                    _,
                    data.clockOrDays,
                    data.rated,
                    pairAt = data.pairAt | nowInstant,
                    startClocksAt = data.startClocksAt,
                    message = data.message,
                    rules = data.rules,
                    scheduledAt = nowInstant,
                    go = data.go.orDefault.some
                  )

object ChallengeBulkSetup:

  val maxGames = 500
  val maxBulks = 20

  case class BadToken(token: Bearer, error: OAuthServer.AuthError)

  case class ScheduledGame(id: GameId, white: UserId, black: UserId):
    def userIds = ByColor(white, black)

  type ID = String
  import reactivemongo.api.bson.Macros.Annotations.Key
  case class ScheduledBulk(
      @Key("_id") id: ID,
      by: UserId,
      games: List[ScheduledGame],
      clock: Either[Clock.Config, Days],
      rated: Rated,
      pairAt: Instant,
      startClocksAt: Option[Instant],
      scheduledAt: Instant,
      message: Option[Template],
      rules: Set[GameRule] = Set.empty,
      pairedAt: Option[Instant] = None,
      // board size, ruleset and komi (unit 3.15); none on bulks scheduled before it
      go: Option[GoSetup] = None
  ):
    def goSetup: GoSetup = go | GoSetups.default
    def userSet = Set(games.flatMap(g => List(g.white, g.black)))
    def collidesWith(other: ScheduledBulk) = {
      pairAt == other.pairAt || startClocksAt.exists(other.startClocksAt.contains)
    } && userSet.exists(other.userSet.contains)
    def nonEmptyRules = rules.nonEmpty.option(rules)
    def perfType = lila.rating.PerfType.Go // Go's one perf (ADR 0021 §1)

  enum ScheduleError:
    case BadTokens(tokens: List[BadToken])
    case DuplicateUsers(users: List[UserId])
    case RateLimited

  case class BulkFormData(
      tokens: String,
      clock: Option[Clock.Config],
      days: Option[Days],
      rated: Rated,
      pairAt: Option[Instant],
      startClocksAt: Option[Instant],
      message: Option[Template],
      rules: Set[GameRule],
      go: GoOptions = GoOptions.default
  ):
    def clockOrDays = clock.toLeft(days | Days(3))

    def allowMultiplePairingsPerUser = clock.isEmpty

  def toJson(bulk: ScheduledBulk) =
    import bulk.*
    import lila.common.Json.given
    import lila.game.JsonView.given
    Json
      .obj(
        "id" -> id,
        "games" -> games.map: g =>
          Json.obj(
            "id" -> g.id,
            "white" -> g.white,
            "black" -> g.black
          ),
        "rated" -> rated,
        "pairAt" -> pairAt,
        "startClocksAt" -> startClocksAt,
        "scheduledAt" -> scheduledAt,
        "pairedAt" -> pairedAt
      )
      .add("clock" -> bulk.clock.left.toOption.map: c =>
        Json.obj(
          "limit" -> c.limitSeconds,
          "increment" -> c.incrementSeconds
        ))
      .add("correspondence" -> bulk.clock.toOption.map: days =>
        Json.obj("daysPerTurn" -> days))
      .add("message" -> message.map(_.value))
      .add("rules" -> nonEmptyRules)
      .add("go" -> GoSetups.json(goSetup).some)

  private[challenge] def extractTokenPairs(str: String): List[PairOf[Bearer]] =
    str
      .split(',')
      .view
      .map(_.split(":"))
      .collect:
        case Array(w, b) =>
          w.trim -> b.trim
      .collect:
        case (w, b) if w.nonEmpty && b.nonEmpty => (Bearer(w), Bearer(b))
      .toList
