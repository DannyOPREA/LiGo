package lila.security

import chess.rating.glicko.Glicko
import scalalib.Maths.isCloseTo

import lila.rating.GoRating
import lila.rating.GoRating.Rank

/* LiGo: the self-declared Go rank, which a player may change on their account page until their
 * first rated game starts (ADR 0021 §2, unit 5.4). LiGo's own code, MIT (COPYING.md §2). */
object GoRankChange:

  private val default = lila.rating.Perf.default

  // the `go` perf a declared rank starts; lila's default (1500, deviation 500) for "I don't know"
  def perfOf(rank: Option[Rank]): Perf =
    rank.fold(default)(r => default.copy(glicko = GoRating.startingGlicko(r)))

  /* The form's current choice for a perf that hasn't moved since signup: "" while it is lila's
   * default, else the rank it starts in (the middle of that rank, so the rank itself). */
  def choiceOf(perf: Perf): String =
    if isDefault(perf.glicko) then "" else Rank.ofRating(perf.glicko.rating).name

  private def isDefault(g: Glicko) =
    isCloseTo(g.rating, default.glicko.rating, 1e-6) && isCloseTo(g.deviation, default.glicko.deviation, 1e-6)

  // open to change until a rated game starts: a finished one also shows in the perf's game count
  def open(perf: Perf, hasRatedGame: Boolean): Boolean = perf.nb == 0 && !hasRatedGame
