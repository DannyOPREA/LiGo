package lila.rating

import chess.{ ByColor, Color, Outcome }
import chess.rating.glicko.{ Glicko, GlickoCalculator, Player, Tau }

/* LiGo: Go ranks, handicap maths and the Go Glicko-2 settings (ADR 0013, ADR 0021).
 * LiGo's own code, MIT (COPYING.md §2), not derived from lila.
 *
 * The rank curve and the handicap maths are ported from goratings'
 * analysis/util/RatingMath.py @ 6cab309 (MIT, Copyright (c) 2020 online-go.com;
 * notice in modules/rating/NOTICE-goratings.md), by way of the ratings memo
 * (docs/build-vs-buy/ratings.md).
 * The kyu/dan label rule follows OGS's published curve, written from the memo.
 *
 * Nothing in lila calls this yet: unit 5.3 rates games with it, 5.4 starts
 * new players from `startingGlicko`, 5.5 shows `label`, 5.7 suggests stones. */
object GoRating:

  // rank = ln(rating / 525) × 23.15; rank 30 is 1d (ADR 0004)
  private val curveA = 525d
  private val curveC = 23.15d

  def rankOf(rating: Double): Double = math.log(rating / curveA) * curveC
  def ratingOf(rank: Double): Double = curveA * math.exp(rank / curveC)

  /* A kyu/dan rank as players name it: `Kyu(5)` is 5k, `Dan(1)` is 1d.
   * Shown ranks are clamped to 25k–9d, OGS's display bounds (ADR 0021 §3). */
  enum Rank:
    case Kyu(k: Int)
    case Dan(d: Int)

    def name: String = this match
      case Kyu(k) => s"${k}k"
      case Dan(d) => s"${d}d"

    // the rank value at the bottom and in the middle of this rank's band
    def lowerRank: Double = this match
      case Kyu(k) => 30d - k
      case Dan(d) => 29d + d
    def middleRank: Double = lowerRank + 0.5

    def lowerRating: Double = ratingOf(lowerRank)
    def middleRating: Double = ratingOf(middleRank)

  object Rank:
    val weakestKyu = 25
    val strongestDan = 9

    // 25k, 24k … 1k, 1d … 9d
    val all: List[Rank] =
      (weakestKyu to 1 by -1).map(Kyu(_)).toList ::: (1 to strongestDan).map(Dan(_)).toList

    def ofRank(rank: Double): Rank =
      if rank < 30 then Kyu(math.ceil(30 - rank).toInt.min(weakestKyu))
      else Dan(math.floor(rank - 29).toInt.min(strongestDan))

    def ofRating(rating: Double): Rank = ofRank(rankOf(rating))

    def fromName(name: String): Option[Rank] =
      all.find(_.name == name)

  /* The label shown instead of a rating: "5k", or "5k?" while the rating is
   * provisional (deviation ≥ 110, scalachess's threshold, kept by ADR 0013). */
  def label(glicko: Glicko): String =
    val name = Rank.ofRating(glicko.rating).name
    if glicko.provisional.yes then s"$name?" else name

  /* The rating at the lower edge of each rank, 25k to 9d. The browser turns
   * rank ranges into rating ranges with it, and the rating graph draws its
   * kyu/dan axis from it (ADR 0021 §3). */
  val rankTable: List[(String, Int)] =
    Rank.all.map(r => r.name -> math.ceil(r.lowerRating).toInt)

  // Glicko-2 as OGS runs it: tau 0.5, and the deviation increase (step 6)
  // is applied in each update, i.e. `skipDeviationIncrease = false` (ADR 0013)
  val calculator = GlickoCalculator(
    tau = Tau(0.5),
    ratingPeriodsPerDay = lila.rating.Glicko.periodsPerDay
  )
  val defaultVolatility = 0.06d
  val maxVolatility = 0.15d

  // a self-declared rank starts in the middle of that rank (ADR 0021 §2)
  val declaredDeviation = 250d
  def startingGlicko(declared: Rank): Glicko =
    Glicko(declared.middleRating, declaredDeviation, defaultVolatility)

  enum Scoring:
    case Territory, Area // Japanese, Chinese

  /* goratings' handicap maths as written: how many ranks Black's head start is
   * worth, from handicap stones, komi, scoring and board size. A stone is worth
   * 12 points (13 under area scoring), fair komi is 6 (7), and one stone is one
   * rank on 19×19, 3 on 13×13 and 6 on 9×9. goratings counts a handicap of 1
   * as "no komi" plus, under area scoring, one point of compensation. */
  def goratingsRankDifference(handicap: Int, size: Int, komi: Double, scoring: Scoring): Double =
    val extraMoves = if handicap > 1 then handicap - 1 else 0
    val (areaBonus, scoringBonus) = scoring match
      case Scoring.Territory => (0, 0)
      case Scoring.Area => (1, handicap)
    val fullKomi = komi + scoringBonus
    val fairKomiTerritory = 6
    val fairKomi = fairKomiTerritory + areaBonus
    val stoneValueTerritory = fairKomiTerritory * 2
    val stoneValue = stoneValueTerritory + areaBonus
    val blackHeadStart = fairKomi - fullKomi + stoneValue * extraMoves
    size match
      case 9 => blackHeadStart * 6 / stoneValueTerritory
      case 13 => blackHeadStart * 3 / stoneValueTerritory
      case _ => blackHeadStart / stoneValueTerritory

  /* The same for a LiGo game, whose stored handicap `hc` follows the rules
   * spec: a handicap of 1 places no stone and gives no compensation (R-HCP-2,
   * R-KOMI-3), so it is passed to goratings as handicap 0 with the game's komi
   * (ADR 0021 §4). From 2 stones goratings' compensation matches R-KOMI-3. */
  def rankDifference(hc: Int, size: Int, komi: Double, scoring: Scoring): Double =
    goratingsRankDifference(if hc == 1 then 0 else hc, size, komi, scoring)

  /* What a player's rating is worth in this game: Black's is raised and
   * White's lowered by the handicap's rank difference, in rank space. */
  def effectiveRating(rating: Double, color: Color, rankDiff: Double): Double =
    val shift = if color.black then rankDiff else -rankDiff
    ratingOf(rankOf(rating) + shift)

  /* Rates one game: each player is updated against the opponent's effective
   * rating, one calculator call per player (ADR 0013; scalachess's own
   * `ColorAdvantage` is symmetric and fixed, so it can't do this). The
   * players' `glicko` must already be their current values. */
  def rateGame(players: ByColor[Player], outcome: Outcome, rankDiff: Double): Option[ByColor[Glicko]] =
    def updated(color: Color): Option[Glicko] =
      val me = players(color)
      val opponent = players(!color)
      val shifted = opponent.copy(glicko =
        opponent.glicko.copy(rating = effectiveRating(opponent.glicko.rating, !color, rankDiff))
      )
      // the calculator rates the game as white vs black; put `me` on White
      val asWhite = Outcome(outcome.winner.map(w => if w == color then Color.White else Color.Black))
      calculator
        .computeGame(chess.rating.glicko.Game(ByColor(me, shifted), asWhite), skipDeviationIncrease = false)
        .toOption
        .map(_.white.glicko)
    for
      black <- updated(Color.Black)
      white <- updated(Color.White)
    yield ByColor(white = white, black = black)

  /* Suggested handicap stones for two players' ratings (ADR 0021 §4): one
   * stone per rank on 19×19 and per 6 ranks on 9×9, halves rounded up, capped
   * at 9 and 4. 0 is an even game and 1 the no-komi game. Server games are
   * 9×9 and 19×19 only (R-SCOPE-1), so any other size gets an even game. */
  def suggestedStones(ratingA: Double, ratingB: Double, size: Int): Int =
    val gap = (rankOf(ratingA) - rankOf(ratingB)).abs
    size match
      case 19 => math.floor(gap + 0.5).toInt.min(9)
      case 9 => math.floor(gap / 6 + 0.5).toInt.min(4)
      case _ => 0
