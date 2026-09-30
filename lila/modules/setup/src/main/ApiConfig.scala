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
    go: GoOptions = GoOptions.default
):

  // Go's one perf (ADR 0021 §1)
  def perfType: PerfType = PerfType.Go
  def perfKey = perfType.key

  def goSetup = go.orDefault

  // Go games start from their setup, never from a chess position (unit 3.15)
  def validFen = position.isEmpty

  def validSpeed(isBot: Boolean) =
    !isBot || clock.forall: c =>
      Speed(c) >= Speed.Bullet

  // Go games are casual until Phase 5 (unit 3.15)
  def validRated = rated.no

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
      komi: Option[Double]
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
      go = GoOptions(size, ruleset, komi)
    )
