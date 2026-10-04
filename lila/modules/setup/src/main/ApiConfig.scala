package lila.setup

import chess.format.Fen
import chess.variant.Variant
import chess.{ Rated, Clock, Speed }
import scalalib.model.Days

import lila.core.data.Template
import lila.core.game.GameRule
import lila.core.setup.GoOptions
import lila.lobby.TriColor
import lila.rating.PerfType

final case class ApiConfig(
    variant: chess.variant.Variant,
    clock: Option[Clock.Config],
    days: Option[Days],
    rated: Rated,
    color: TriColor,
    position: Option[Fen.Full] = None,
    message: Option[Template],
    keepAliveStream: Boolean,
    rules: Set[GameRule] = Set.empty,
    onlyIfOpponentFollowsMe: Boolean = false,
    go: GoOptions = GoOptions.default,
    byoyomi: Option[ligo.gorules.ByoyomiConfig] = None
):

  // Go's one perf (ADR 0021 §1)
  def perfType: PerfType = PerfType.Go
  def perfKey = perfType.key

  def goSetup = go.orDefault

  // Go games start from their setup, never from a chess position (unit 3.15)
  def validFen = position.isEmpty

  def validSpeed(isBot: Boolean) =
    !isBot || clockSettings.forall(_.speed >= Speed.Bullet)

  // the real-time clock asked for, Fischer or byo-yomi (unit 4.9)
  def clockSettings: Option[lila.core.game.ClockSettings] =
    byoyomi
      .map(lila.core.game.ClockSettings.Byoyomi(_))
      .orElse(clock.map(lila.core.game.ClockSettings.Fischer(_)))

  // a rated game needs a setup the rating maths covers (ADR 0021 §4, unit 5.7)
  def validRated = rated.no || go.setup.exists(lila.core.game.GoSetups.canBeRated)

object ApiConfig extends BaseConfig:

  lazy val clockLimitSeconds =
    Clock.LimitSeconds.from(Set(0, 15, 30, 45, 60, 90) ++ (2 to 180).view.map(_ * 60).toSet)

  def from(
      v: Option[Variant.LilaKey],
      cl: Option[Clock.Config],
      d: Option[Days],
      r: Rated,
      c: Option[String],
      pos: Option[Fen.Full],
      msg: Option[String],
      keepAliveStream: Option[Boolean],
      rules: Option[Set[GameRule]],
      onlyIfOpponentFollowsMe: Option[Boolean],
      size: Option[Int],
      ruleset: Option[String],
      komi: Option[Double],
      handicap: Option[Int],
      byoyomi: Option[ligo.gorules.ByoyomiConfig]
  ) =
    ApiConfig(
      variant = chess.variant.Variant.orDefault(v),
      clock = cl,
      days = d,
      rated = r,
      color = TriColor.orDefault(~c),
      position = pos,
      message = msg.map(Template.apply),
      keepAliveStream = ~keepAliveStream,
      rules = ~rules,
      onlyIfOpponentFollowsMe = ~onlyIfOpponentFollowsMe,
      go = GoOptions(size, ruleset, komi, handicap),
      byoyomi = byoyomi
    )
