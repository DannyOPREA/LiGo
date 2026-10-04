package lila.setup

import chess.{ Rated, Clock, Speed }
import scalalib.model.Days

import lila.core.data.Template
import lila.core.game.GameRule
import lila.core.setup.GoOptions
import lila.lobby.TriColor
import lila.rating.PerfType

final case class ApiConfig(
    clock: Option[Clock.Config],
    days: Option[Days],
    rated: Rated,
    color: TriColor,
    message: Option[Template],
    keepAliveStream: Boolean,
    rules: Set[GameRule] = Set.empty,
    onlyIfOpponentFollowsMe: Boolean = false,
    go: GoOptions = GoOptions.default
):

  // Go's one perf (ADR 0021 §1)
  def perfType: PerfType = PerfType.Go
  def perfKey = perfType.key

  def goSetup = go.orDefault

  def validSpeed(isBot: Boolean) =
    !isBot || clock.forall: c =>
      Speed(c) >= Speed.Bullet

  // Go games are casual until Phase 5 (unit 3.15)
  def validRated = rated.no

object ApiConfig extends BaseConfig:

  lazy val clockLimitSeconds =
    Clock.LimitSeconds.from(Set(0, 15, 30, 45, 60, 90) ++ (2 to 180).view.map(_ * 60).toSet)

  def from(
      @annotation.unused v: Option[String], // a chess variant, refused by the form (unit 3.17)
      cl: Option[Clock.Config],
      d: Option[Days],
      r: Rated,
      c: Option[String],
      @annotation.unused pos: Option[String], // a chess position, refused by the form (unit 3.17)
      msg: Option[String],
      keepAliveStream: Option[Boolean],
      rules: Option[Set[GameRule]],
      onlyIfOpponentFollowsMe: Option[Boolean],
      size: Option[Int],
      ruleset: Option[String],
      komi: Option[Double]
  ) =
    ApiConfig(
      clock = cl,
      days = d,
      rated = r,
      color = TriColor.orDefault(~c),
      message = msg.map(Template.apply),
      keepAliveStream = ~keepAliveStream,
      rules = ~rules,
      onlyIfOpponentFollowsMe = ~onlyIfOpponentFollowsMe,
      go = GoOptions(size, ruleset, komi)
    )
