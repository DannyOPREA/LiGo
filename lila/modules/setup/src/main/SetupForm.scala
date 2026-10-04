package lila.setup

import chess.{ Clock, Rated }
import chess.format.Fen
import chess.variant.Variant
import play.api.data.*
import play.api.data.Forms.*
import scalalib.model.Days

import lila.common.Form as LilaForm
import lila.common.Form.{ *, given }
import lila.core.rating.RatingRange

object SetupForm:

  import Mappings.*

  val filter = Form(single("local" -> text))

  // Games against the computer (ai, aiFilled, api.ai) went with fishnet (unit 3.5).

  // A Go game never starts from a chess position (unit 3.15), so a `fen` in the URL is dropped.
  def friendFilled(fen: Option[Fen.Full])(using Option[Me]): Form[FriendConfig] =
    friend.fill(FriendConfig.default)

  private val goFenError = "Go games can't start from a chess position"
  // ADR 0021 §4–§5 (unit 5.7): rated games for signed-in players, on setups the rating maths covers
  private val ratedError =
    "A rated Go game needs a 9x9 or 19x19 board, the standard komi, and at most 9 handicap stones on 19x19 or 4 on 9x9"
  private val ratedEvenError = "A rated game without a named opponent has no handicap"
  private def ratedOk(rated: Rated, go: lila.core.setup.GoOptions) =
    rated.no || go.setup.exists(lila.core.game.GoSetups.canBeRated)
  private val komiError = "Komi must be a multiple of 0.5 no bigger than the board"
  private val byoyomiError = "Use one of clock, byoyomi or days"
  private val goError = "Komi must be a multiple of 0.5 no bigger than the board, and handicap 0 to 9 stones"

  def friend(using me: Option[Me]) = Form:
    mapping(
      "variant" -> variant,
      "timeMode" -> timeMode,
      "time" -> time,
      "increment" -> increment,
      "days" -> days,
      "mode" -> mode(withRated = me.isDefined),
      "color" -> color,
      "fen" -> fenField,
      "size" -> goSize,
      "ruleset" -> goRuleset,
      "komi" -> goKomi,
      "periods" -> periods,
      "periodTime" -> periodTime,
      "handicap" -> goHandicap
    )(FriendConfig.from)(_.>>)
      .verifying("Invalid clock", _.validClock)
      .verifying("Invalid speed", _.validSpeed(me.exists(_.isBot)))
      .verifying("Can't create rated unlimited game", !_.isRatedUnlimited)
      .verifying(goFenError, _.validFen)
      .verifying(goError, _.go.valid)
      .verifying(ratedError, c => ratedOk(c.rated, c.go))

  def hookFilled(timeModeString: Option[String])(using me: Option[Me]): Form[HookConfig] =
    hook.fill(HookConfig.default(me.isDefined).withTimeModeString(timeModeString))

  def hook(using me: Option[Me]) = Form:
    mapping(
      "variant" -> variant,
      "timeMode" -> timeMode,
      "time" -> time,
      "increment" -> increment,
      "days" -> days,
      "mode" -> mode(withRated = me.isDefined),
      "ratingRange" -> optional(ratingRange),
      "color" -> lila.common.Form.empty,
      "size" -> goSize,
      "ruleset" -> goRuleset,
      "komi" -> goKomi,
      "periods" -> periods,
      "periodTime" -> periodTime
    )(HookConfig.from)(_.>>)
      .verifying("Invalid clock", _.validClock)
      .verifying("Can't create rated unlimited game", !_.isRatedUnlimited)
      .verifying(komiError, _.go.valid)
      .verifying(ratedError, c => ratedOk(c.rated, c.go))

  private lazy val boardApiHookBase: Mapping[HookConfig] =
    mapping(
      "time" -> optional(time),
      "increment" -> optional(increment),
      "days" -> optional(days),
      "variant" -> optional(boardApiVariantKeys),
      "rated" -> optional(boolean.into[Rated]),
      "ratingRange" -> optional(ratingRange),
      "color" -> optional(color),
      "size" -> goSize,
      "ruleset" -> goRuleset,
      "komi" -> goKomi
    )((t, i, d, v, r, g, c, size, ruleset, komi) =>
      HookConfig(
        variant = Variant.orDefault(v),
        timeMode = if d.isDefined then TimeMode.Correspondence else TimeMode.RealTime,
        time = t | 10,
        increment = i | Clock.IncrementSeconds(5),
        days = d | Days(7),
        rated = r | Rated.No,
        ratingRange = g.fold(RatingRange.default)(RatingRange.orDefault),
        color = lila.lobby.TriColor.orDefault(c),
        go = lila.core.setup.GoOptions(size, ruleset, komi)
      )
    )(_ => none)
      .verifying("Invalid clock", _.validClock)
      .verifying(komiError, _.go.valid)
      .verifying(ratedError, c => ratedOk(c.rated, c.go))

  def boardApiHook(allowFastGames: Boolean) = Form:
    boardApiHookBase.verifying(
      "Invalid time control",
      hook =>
        allowFastGames || hook.makeClock.exists(
          lila.core.game.isBoardCompatible
        ) || hook.makeDaysPerTurn.isDefined
    )

  def toFriend = Form(single("username" -> lila.common.Form.username.historicalField))

  object api extends lila.core.setup.SetupForm:

    lazy val clockMapping =
      mapping(
        "limit" -> number.into[Clock.LimitSeconds].verifying(ApiConfig.clockLimitSeconds.contains),
        "increment" -> increment
      )(Clock.Config.apply)(unapply)
        .verifying("Invalid clock", _.estimateTotalTime.nonZero)

    lazy val clock = "clock" -> optional(clockMapping)

    lazy val optionalDays = "days" -> optional(days)

    lazy val variant = "variant" -> optional(typeIn(boardApiVariants))

    lazy val goSize = "size" -> Mappings.goSize
    lazy val goRuleset = "ruleset" -> Mappings.goRuleset
    lazy val goKomi = "komi" -> Mappings.goKomi
    lazy val goHandicap = "handicap" -> Mappings.goHandicap

    // a byo-yomi clock instead of `clock` (unit 4.9): main time, periods and the seconds in each
    lazy val byoyomi = "byoyomi" -> optional(
      mapping(
        "limit" -> number.verifying(ApiConfig.clockLimitSeconds.map(_.value).contains),
        "periods" -> typeIn(ByoyomiPeriods.periodChoices.toSet),
        "period" -> typeIn(ByoyomiPeriods.secondChoices.toSet)
      )(ligo.gorules.ByoyomiConfig.apply)(unapply)
        .verifying("Invalid byo-yomi clock", _.isValid)
    )

    lazy val message = "message" -> optional(
      nonEmptyText(maxLength = 8_000).verifying(
        "The message must contain {game}, which will be replaced with the game URL.",
        _.contains("{game}")
      )
    )

    val rules = "rules" -> optional:
      import lila.core.game.GameRule
      lila.common.Form.strings
        .separator(",")
        .verifying(_.forall(GameRule.byKey.contains))
        .transform[Set[GameRule]](rs => rs.flatMap(GameRule.byKey.get).toSet, _.map(_.toString).toList)

    def user(using from: Me) =
      Form(challengeMapping.verifying("Invalid speed", _.validSpeed(from.isBot)))

    def admin = Form(challengeMapping)

    private val challengeMapping =
      mapping(
        variant,
        clock,
        optionalDays,
        "rated" -> boolean.into[Rated],
        "color" -> optional(color),
        "fen" -> fenField,
        message,
        "keepAliveStream" -> optional(boolean),
        rules,
        "onlyIfOpponentFollowsMe" -> optional(boolean),
        goSize,
        goRuleset,
        goKomi,
        goHandicap,
        byoyomi
      )(ApiConfig.from)(_ => none)
        .verifying(goFenError, _.validFen)
        .verifying(ratedError, _.validRated)
        .verifying(goError, _.go.valid)
        .verifying(byoyomiError, c => c.byoyomi.isEmpty || (c.clock.isEmpty && c.days.isEmpty))

    // a guest's open challenge is casual (ADR 0021 §5, unit 5.7)
    def open(isAdmin: Boolean, guest: Boolean = false) = Form:
      openMapping
        .verifying(
          "The `noAbort` rule is now restricted to challenge administrators",
          d => !d.rules.contains(lila.core.game.GameRule.noAbort) || isAdmin
        )
        .verifying("Sign up to play rated games", d => !guest || d.rated.no)

    private lazy val openMapping = mapping(
      "name" -> optional(LilaForm.cleanNonEmptyText(maxLength = 200)),
      variant,
      clock,
      optionalDays,
      "rated" -> boolean.into[Rated],
      "fen" -> fenField,
      "users" -> optional:
        LilaForm.strings
          .separator(",")
          .verifying("Must be 2 usernames, white and black", _.sizeIs == 2)
          .transform[List[UserStr]](UserStr.from(_), UserStr.raw(_))
      ,
      rules,
      "expiresAt" -> optional:
        inTheFuture(ISOInstantOrTimestamp.mapping)
          .verifying("Open challenges must expire within 2 weeks", _.isBefore(nowInstant.plusWeeks(2)))
      ,
      goSize,
      goRuleset,
      goKomi,
      goHandicap,
      byoyomi
    )(OpenConfig.from)(_ => none)
      .verifying(goFenError, _.validFen)
      .verifying(goError, _.go.valid)
      .verifying(ratedError, c => ratedOk(c.rated, c.go))
      .verifying(ratedEvenError, c => c.rated.no || c.go.handicap.forall(_ == 0))
      .verifying(byoyomiError, c => c.byoyomi.isEmpty || (c.clock.isEmpty && c.days.isEmpty))
