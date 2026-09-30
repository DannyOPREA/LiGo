package lila.round

import chess.{ ByColor, Outcome }
import chess.rating.glicko.{ Glicko, Player }
import ligo.gorules.{ BoardSize, Komi, Ruleset, Setup as GoSetup }

import lila.rating.GoRating

/* LiGo: how a rated Go game moves its players' `go` ratings (ADR 0013, ADR 0021 §4, unit 5.3).
 * LiGo's own code, MIT (COPYING.md §2). */
private object GoRatedGame:

  /* Why a Go game can't move ratings, if it can't. ADR 0021 §4 rates only games the handicap
   * maths was calibrated for: 9x9 or 19x19 (13x13 is left to its own ADR), no custom position,
   * the spec's komi, and at most 9 stones on 19x19 or 4 on 9x9. Game creation keeps other games
   * casual (unit 5.7); this is the last check, so a stray rated game is left unrated rather than
   * rated wrongly. */
  def refusal(setup: GoSetup): Option[String] =
    val maxHandicap = setup.size match
      case BoardSize.Nineteen => 9.some
      case BoardSize.Nine => 4.some
      case BoardSize.Thirteen => none
    maxHandicap match
      case None => s"a ${setup.size.lines}x${setup.size.lines} board".some
      case _ if setup.position.isDefined => "a custom starting position".some
      case Some(max) if setup.handicap > max =>
        s"handicap ${setup.handicap} on ${setup.size.lines}x${setup.size.lines}".some
      case _ if setup.komi != Komi.standard(setup.ruleset, setup.handicap) => s"komi ${setup.komi}".some
      case _ => none

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
