package lila.pool

import scalalib.WMMatching
import scala.math.abs
import chess.IntRating

import lila.core.pool.PoolMember

object MatchMaking:

  case class Couple(p1: PoolMember, p2: PoolMember):
    def members = Vector(p1, p2)
    def userIds = members.map(_.userId)
    def ratingDiff = p1.ratingDiff(p2)

  // LiGo: `size` is the pool's board size, which GoPairing's score needs (ADR 0022 §3)
  def apply(members: Vector[PoolMember], size: Int): Vector[Couple] =
    val (lames, fairs) = members.partition(_.lame)
    naive(lames) ++ (wmMatching(fairs, size) | naive(fairs))

  private def naive(members: Vector[PoolMember]): Vector[Couple] =
    members
      .sortBy(_.rating)(using intOrdering[IntRating].reverse)
      .grouped(2)
      .collect:
        case Vector(p1, p2) => Couple(p1, p2)
      .toVector

  private[pool] object wmMatching:

    // above that, no pairing is allowed
    // 1000 ~> 130
    // 1200 ~> 100
    // 1500 ~> 100
    // 2000 ~> 133
    // 2500 ~> 166
    // 3000 ~> 200
    private[pool] def ratingToMaxScore(rating: IntRating) =
      if rating < IntRating(1000) then 130
      else if rating < IntRating(1500) then 100
      else rating.value / 15

    // quality of a potential pairing. Lower is better.
    // None indicates a forbidden pairing
    private[pool] def pairScore(a: PoolMember, b: PoolMember): Option[Int] =
      val conflict =
        a.userId == b.userId ||
          ratingRangeConflict(a, b) ||
          ratingRangeConflict(b, a) ||
          blockList(a, b) ||
          blockList(b, a)
      if conflict then none
      else
        val score =
          a.ratingDiff(b).value
            - missBonus(a).atMost(missBonus(b))
            - rangeBonus(a, b)
            - ragesitBonus(a, b)
            - provisionalBonus(a, b)
        score.some.filter(_ <= ratingToMaxScore(a.rating.atMost(b.rating)))

    // score bonus based on how many waves the member missed
    // when the user's sit counter is lower than -3, the maximum bonus becomes lower
    private[pool] def missBonus(p: PoolMember) =
      (p.misses * 12)
        .atMost(460 + (p.rageSitCounter.atMost(-3)) * 20)
        .atLeast(0)

    // if players have conflicting rating ranges
    private[pool] def ratingRangeConflict(a: PoolMember, b: PoolMember): Boolean =
      a.ratingRange.exists(!_.contains(b.rating))

    // bonus if both players have rating ranges, and they're compatible
    private[pool] def rangeBonus(a: PoolMember, b: PoolMember) =
      if a.ratingRange.exists(_.contains(b.rating)) && b.ratingRange.exists(_.contains(a.rating))
      then 200
      else 0

    // if players block each other
    private[pool] def blockList(a: PoolMember, b: PoolMember): Boolean =
      a.blocking.value contains b.userId

    // bonus if the two players both have a good sit counter
    // bonus if the two players both have a bad sit counter
    // malus (so negative number as bonus) if neither of those are true, meaning that their sit counters are far away (e.g. 0 and -5)
    private[pool] def ragesitBonus(a: PoolMember, b: PoolMember) =
      if a.rageSitCounter >= -2 && b.rageSitCounter >= -2 then 30 // good players
      else if a.rageSitCounter <= -12 && b.rageSitCounter <= -12 then 60 // very bad players
      else if a.rageSitCounter <= -5 && b.rageSitCounter <= -5 then 30 // bad players
      else (abs(a.rageSitCounter - b.rageSitCounter).atMost(10)) * -20 // match of good and bad player

    private[pool] def provisionalBonus(a: PoolMember, b: PoolMember) =
      if a.provisional && b.provisional then 30 else 0

    /* LiGo: pairs by GoPairing's score (ADR 0022 §3), lila's with the miss bonus per second of waiting.
     * Every member counts as Even only until unit 4.9 lets a game start with handicap stones and the
     * lobby sends the Handicap OK chip. */
    def apply(members: Vector[PoolMember], size: Int): Option[Vector[Couple]] =
      val goMembers = members.map(GoPairing.Member(_, handicapOk = false, rankKnown = false))
      WMMatching(goMembers.toArray, GoPairing.pairScore(_, _, size)).fold(
        err =>
          logger.error("WMMatching", err)
          none
        ,
        _.map((a, b) => Couple(a.pool, b.pool)).toVector.some
      )
