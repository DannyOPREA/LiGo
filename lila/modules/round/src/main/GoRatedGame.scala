package lila.round

import chess.{ ByColor, Outcome }
import chess.rating.glicko.{ Glicko, Player }
import ligo.gorules.{ Ruleset, Setup as GoSetup }

import lila.rating.GoRating

/* LiGo: how a rated Go game moves its players' `go` ratings (ADR 0013, ADR 0021 §4, unit 5.3).
 * LiGo's own code, MIT (COPYING.md §2). */
private object GoRatedGame:

  /* Why a Go game can't move ratings, if it can't: ADR 0021 §4's rule, `GoSetups.ratedRefusal`. Game
   * creation keeps other games casual (unit 5.7); this is the last check, so a stray rated game is left
   * unrated rather than rated wrongly. */
  def refusal(setup: GoSetup): Option[String] = lila.core.game.GoSetups.ratedRefusal(setup)

  def scoring(ruleset: Ruleset): GoRating.Scoring = ruleset match
    case Ruleset.Japanese => GoRating.Scoring.Territory
    case Ruleset.Chinese => GoRating.Scoring.Area

  // how many ranks Black's head start is worth in this game (komi alone shifts an even game a little)
  def rankDifference(setup: GoSetup): Double =
    GoRating.rankDifference(setup.handicap, setup.size.lines, setup.komi, scoring(setup.ruleset))

  // each player's rating as the Go calculator takes it: capped with Go's volatility ceiling
  def player(perf: Perf): Player = Player(GoRating.cap(perf.glicko), perf.nb, perf.latest)

  /* The players' new Glicko-2 values, each rated against the opponent's handicap-shifted
   * rating (GoRating.rateGame), or why the game isn't rated. */
  def glickos(setup: GoSetup, before: ByColor[Perf], outcome: Outcome): Either[String, ByColor[Glicko]] =
    refusal(setup)
      .toLeft(())
      .flatMap: _ =>
        GoRating
          .rateGame(before.map(player), outcome, rankDifference(setup))
          .toEither
          .left
          .map(e => s"Glicko-2 failed: ${e.getMessage}")
