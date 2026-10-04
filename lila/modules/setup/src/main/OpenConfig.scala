package lila.setup

import chess.{ Clock, Rated }
import chess.format.Fen
import chess.variant.Variant
import scalalib.model.Days

import lila.core.game.GameRule
import lila.core.setup.GoOptions

final case class OpenConfig(
    name: Option[String],
    variant: chess.variant.Variant,
    clock: Option[Clock.Config],
    days: Option[Days],
    rated: Rated,
    position: Option[Fen.Full],
    userIds: Option[(UserId, UserId)],
    rules: Set[GameRule] = Set.empty,
    expiresAt: Option[Instant],
    go: GoOptions = GoOptions.default,
    byoyomi: Option[ligo.gorules.ByoyomiConfig] = None
) extends lila.core.setup.OpenConfig:

  // Go's one perf (ADR 0021 §1)
  def perfType = lila.rating.PerfType.Go

  def goSetup = go.orDefault

  // Go games start from their setup, never from a chess position (unit 3.15)
  def validFen = position.isEmpty

object OpenConfig:

  def from(
      n: Option[String],
      v: Option[Variant.LilaKey],
      cl: Option[Clock.Config],
      days: Option[Days],
      rated: Rated,
      pos: Option[Fen.Full],
      usernames: Option[List[UserStr]],
      rules: Option[Set[GameRule]],
      expiresAt: Option[Instant],
      size: Option[Int],
      ruleset: Option[String],
      komi: Option[Double],
      handicap: Option[Int],
      byoyomi: Option[ligo.gorules.ByoyomiConfig]
  ) =
    OpenConfig(
      name = n.map(_.trim).filter(_.nonEmpty),
      variant = Variant.orDefault(v),
      clock = cl,
      days = days,
      rated = rated,
      position = pos,
      userIds = usernames.map(_.map(_.id)).collect { case List(w, b) =>
        (w, b)
      },
      rules = ~rules,
      expiresAt = expiresAt,
      go = GoOptions(size, ruleset, komi, handicap),
      byoyomi = byoyomi
    )
