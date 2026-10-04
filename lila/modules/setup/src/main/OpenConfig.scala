package lila.setup

import chess.{ Clock, Rated }
import scalalib.model.Days

import lila.core.game.GameRule
import lila.core.setup.GoOptions

final case class OpenConfig(
    name: Option[String],
    clock: Option[Clock.Config],
    days: Option[Days],
    rated: Rated,
    userIds: Option[(UserId, UserId)],
    rules: Set[GameRule] = Set.empty,
    expiresAt: Option[Instant],
    go: GoOptions = GoOptions.default
) extends lila.core.setup.OpenConfig:

  // Go's one perf (ADR 0021 §1)
  def perfType = lila.rating.PerfType.Go

  def goSetup = go.orDefault

object OpenConfig:

  def from(
      n: Option[String],
      @annotation.unused v: Option[String], // a chess variant, refused by the form (unit 3.17)
      cl: Option[Clock.Config],
      days: Option[Days],
      rated: Rated,
      @annotation.unused pos: Option[String], // a chess position, refused by the form (unit 3.17)
      usernames: Option[List[UserStr]],
      rules: Option[Set[GameRule]],
      expiresAt: Option[Instant],
      size: Option[Int],
      ruleset: Option[String],
      komi: Option[Double]
  ) =
    OpenConfig(
      name = n.map(_.trim).filter(_.nonEmpty),
      clock = cl,
      days = days,
      rated = rated,
      userIds = usernames.map(_.map(_.id)).collect { case List(w, b) =>
        (w, b)
      },
      rules = ~rules,
      expiresAt = expiresAt,
      go = GoOptions(size, ruleset, komi)
    )
