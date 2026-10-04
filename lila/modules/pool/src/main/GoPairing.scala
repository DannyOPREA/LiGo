package lila.pool

import chess.IntRating

import lila.core.pool.PoolMember
import lila.rating.GoRating

/* LiGo: pairing with auto-handicap in the rated pools (ADR 0022 §3–§4).
 * Added by LiGo to lila's pool module; `pairScore` and `missBonus` are
 * adapted from lila's `MatchMaking.wmMatching`, so the file is AGPL-3.0 like
 * the rest of lila (COPYING.md §1).
 *
 * A pair where both players said "Handicap OK" gets the stones
 * `GoRating.suggestedStones` gives for their rating gap (ADR 0021 §4), and
 * the pairing score judges it by the rank gap the stones leave uncovered
 * instead of the full rating gap. Every other part of lila's score (miss,
 * range, rage-sit and provisional bonuses, the cap, range conflicts and
 * blocks) is lila's own, from `MatchMaking.wmMatching`.
 *
 * `MatchMaking` pairs every pool with `pairScore` and `GameStarter` starts
 * the game with `stones`, `black` taking Black (unit 6.4). */
object GoPairing:

  import MatchMaking.wmMatching.{
    blockList,
    provisionalBonus,
    ragesitBonus,
    rangeBonus,
    ratingRangeConflict,
    ratingToMaxScore
  }

  /* What the pairing needs to know about a member beyond lila's `PoolMember`.
   * `handicapOk`: the member's "Handicap OK / Even only" chip.
   * `rankKnown`: false for an account still at lila's default 1500 / 500
   * (never declared a rank, never finished a rated game); it gets even games
   * only (ADR 0021 §4). */
  case class Member(pool: PoolMember, handicapOk: Boolean, rankKnown: Boolean):
    def rating: Double = pool.rating.value.toDouble

  // added to a handicap pair's score per stone, so that at the same uncovered
  // gap an even game is preferred to a handicap one (ADR 0022 §3)
  val scorePerStone = 15

  /* The miss bonus at lila's rate per second rather than per wave (ADR 0022
   * §1): LiGo's pools run a wave every 5 s, lila's fastest every 12 s with
   * 12 points a miss. The ceiling is lila's. */
  val missPointsPerWave = 5

  def missBonus(p: PoolMember): Int =
    (p.misses * missPointsPerWave)
      .atMost(460 + (p.rageSitCounter.atMost(-3)) * 20)
      .atLeast(0)

  // ranks one stone covers (ADR 0013, ADR 0021 §4): 1 on 19×19, 6 on 9×9
  def stoneValue(size: Int): Double = if size == 9 then 6d else 1d

  /* Handicap stones for this pair: 0 unless both said Handicap OK and both
   * have a rank; then ADR 0021 §4's suggestion, capped per board size. */
  def stones(a: Member, b: Member, size: Int): Int =
    if a.handicapOk && b.handicapOk && a.rankKnown && b.rankKnown
    then GoRating.suggestedStones(a.rating, b.rating, size)
    else 0

  /* Who takes Black: with stones, the lower-rated player (ADR 0021 §4; with
   * stones the ratings differ by at least half a rank, so there is no tie);
   * without stones, None: lila's random colours. */
  def black(a: Member, b: Member, size: Int): Option[UserId] =
    (stones(a, b, size) > 0).option(if a.rating < b.rating then a.pool.userId else b.pool.userId)

  /* The pair's "rating gap" term, in rating points (ADR 0022 §3).
   * An even pair: lila's own `|ratingA − ratingB|`. A handicap pair of n
   * stones: `ratingOf(rankOf(low) + left) − low + 15 × n`, where `left` is
   * the rank gap the stones don't cover, one stone counting `stoneValue`
   * ranks. Above the stone cap the uncovered part counts like any rating
   * gap, so lila's score cap still forbids the pair. */
  def gap(a: Member, b: Member, size: Int): Int =
    val n = stones(a, b, size)
    if n == 0 then (a.rating - b.rating).abs.round.toInt
    else
      val low = a.rating.min(b.rating)
      val rankGap = (GoRating.rankOf(a.rating) - GoRating.rankOf(b.rating)).abs
      val left = (rankGap - n * stoneValue(size)).abs
      val points = GoRating.ratingOf(GoRating.rankOf(low) + left) - low
      points.round.toInt + n * scorePerStone

  /* lila's pair score (`MatchMaking.wmMatching.pairScore`) with `gap` in
   * place of the rating difference and the per-second `missBonus`. Lower is better; None: not allowed. */
  def pairScore(a: Member, b: Member, size: Int): Option[Int] =
    val (p, q) = (a.pool, b.pool)
    val conflict =
      p.userId == q.userId ||
        ratingRangeConflict(p, q) ||
        ratingRangeConflict(q, p) ||
        blockList(p, q) ||
        blockList(q, p)
    if conflict then none
    else
      val score =
        gap(a, b, size)
          - missBonus(p).atMost(missBonus(q))
          - rangeBonus(p, q)
          - ragesitBonus(p, q)
          - provisionalBonus(p, q)
      score.some.filter(_ <= ratingToMaxScore(p.rating.atMost(q.rating)))

  /* The ranks a waiting member can meet now, for the pool tile (ADR 0022 §4).
   * A rank from 25k to 9d is reachable when its middle rating gives an
   * allowed `pairScore` against a typical opponent there, one like the member
   * (waited as long, the same sit counter) who is not provisional, has no
   * range setting and said Handicap OK; the member's own range setting still
   * applies. `weakest`–`strongest` is the unbroken run of reachable ranks
   * around the member's own rank: on 9×9, where a stone covers six ranks,
   * the reachable ranks come in several runs, and a tile summing them up as
   * one span would claim ranks it can't pair. `maxStones` is the most stones
   * among all reachable ranks (0 for Even only), shown as "or with up to N
   * stones". None when the member's own rank isn't reachable (a range
   * setting that excludes it). */
  case class WaitingRange(weakest: GoRating.Rank, strongest: GoRating.Rank, maxStones: Int)

  def waitingRange(member: Member, size: Int): Option[WaitingRange] =
    val reachable = GoRating.Rank.all.map: rank =>
      val opponent = Member(
        member.pool.copy(
          userId = UserId("~typical-opponent"),
          rating = IntRating(rank.middleRating.round.toInt),
          provisional = false,
          ratingRange = None,
          blocking = lila.core.pool.Blocking(Set.empty),
          rageSitCounter = member.pool.rageSitCounter
        ),
        handicapOk = true,
        rankKnown = true
      )
      pairScore(member, opponent, size).map(_ => stones(member, opponent, size))
    val own = GoRating.Rank.all.indexOf(GoRating.Rank.ofRating(member.rating))
    def run(step: Int) =
      Iterator.iterate(own)(_ + step).takeWhile(i => reachable.lift(i).exists(_.isDefined)).toList
    val below = run(-1)
    below.headOption.map: _ =>
      WaitingRange(
        weakest = GoRating.Rank.all(below.last),
        strongest = GoRating.Rank.all(run(1).last),
        maxStones = reachable.flatten.max
      )
