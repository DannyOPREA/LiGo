package lila.rating

import chess.{ ByColor, Color, Outcome }
import chess.rating.glicko.{ Glicko, Player }
import play.api.libs.json.*
import scalalib.Maths.isCloseTo

import GoRating.*

class GoRatingTest extends munit.FunSuite:

  // expected values computed by goratings itself (see goRatingCases.py next to it)
  private lazy val cases: JsObject =
    val stream = getClass.getResourceAsStream("/goRatingCases.json")
    try Json.parse(stream).as[JsObject]
    finally stream.close()

  private def list(key: String): List[JsObject] = (cases \ key).as[List[JsObject]]
  private def triple(js: JsLookupResult): (Double, Double, Double) =
    val List(r, d, v) = js.as[List[Double]]: @unchecked
    (r, d, v)
  private def glickoOf(t: (Double, Double, Double)) = Glicko(t._1, t._2, t._3)
  private def player(t: (Double, Double, Double)) = Player(glickoOf(t), 0, None)
  private def scoring(rules: String) = if rules == "chinese" then Scoring.Area else Scoring.Territory

  private def assertGlicko(obtained: Glicko, expected: (Double, Double, Double), clue: String) =
    assert(
      isCloseTo(obtained.rating, expected._1, 1e-6),
      s"$clue rating ${obtained.rating} vs ${expected._1}"
    )
    assert(isCloseTo(obtained.deviation, expected._2, 1e-6), s"$clue deviation ${obtained.deviation}")
    assert(isCloseTo(obtained.volatility, expected._3, 1e-6), s"$clue volatility ${obtained.volatility}")

  test("rank curve matches goratings"):
    list("ranks").foreach: c =>
      val rating = (c \ "rating").as[Double]
      assert(isCloseTo(rankOf(rating), (c \ "rank").as[Double], 1e-9), s"rank of $rating")
      assert(isCloseTo(ratingOf(rankOf(rating)), rating, 1e-9), s"inverse at $rating")

  test("kyu/dan labels, clamped to 25k-9d, with ? while provisional"):
    val all = list("ranks")
    assert(all.size > 100)
    all.foreach: c =>
      val g = Glicko((c \ "rating").as[Double], (c \ "deviation").as[Double], 0.06)
      assertEquals(label(g), (c \ "label").as[String], s"rating ${g.rating} deviation ${g.deviation}")

  test("the ratings memo's rank labels"):
    List(
      525 -> "25k",
      1000 -> "16k",
      1500 -> "6k",
      1800 -> "2k",
      1950 -> "1d",
      2100 -> "3d",
      2400 -> "6d",
      2800 -> "9d"
    ).foreach: (rating, name) =>
      assertEquals(label(Glicko(rating, 60, 0.06)), name)
    assertEquals(label(Glicko(1500, 200, 0.06)), "6k?")

  test("rank names and the rank table"):
    assertEquals(Rank.all.size, 34)
    assertEquals(Rank.all.head, Rank.Kyu(25))
    assertEquals(Rank.all.last, Rank.Dan(9))
    assertEquals(Rank.fromName("5k"), Some(Rank.Kyu(5)))
    assertEquals(Rank.fromName("1d"), Some(Rank.Dan(1)))
    assertEquals(Rank.fromName("10d"), None)
    assertEquals(rankTable.map(_._1), Rank.all.map(_.name))
    assert(rankTable.map(_._2).sliding(2).forall { case List(a, b) => a < b; case _ => true })
    // every rating at or above a rank's edge (and below the next one) shows that rank
    rankTable
      .zip(rankTable.drop(1))
      .foreach:
        case ((name, edge), (_, next)) =>
          assertEquals(Rank.ofRating(edge).name, name)
          assertEquals(Rank.ofRating(next - 1).name, name)

  test("a self-declared rank starts in the middle of that rank (ADR 0021)"):
    List(
      Rank.Kyu(25) -> 666,
      Rank.Kyu(15) -> 1026,
      Rank.Kyu(10) -> 1273,
      Rank.Kyu(5) -> 1580,
      Rank.Kyu(1) -> 1877,
      Rank.Dan(1) -> 1960,
      Rank.Dan(5) -> 2330,
      Rank.Dan(9) -> 2770
    ).foreach: (rank, rating) =>
      val g = startingGlicko(rank)
      assertEquals(g.rating.round.toInt, rating, rank.name)
      assertEquals(g.deviation, 250d)
      assertEquals(g.volatility, 0.06)
      assertEquals(label(g), s"${rank.name}?")
    Rank.all.foreach: rank =>
      assertEquals(Rank.ofRating(startingGlicko(rank).rating), rank)

  test("handicap rank difference matches goratings on the whole grid"):
    val grid = list("handicap")
    assertEquals(grid.size, 90)
    grid.foreach: c =>
      val (hc, size, komi) = ((c \ "handicap").as[Int], (c \ "size").as[Int], (c \ "komi").as[Double])
      val s = scoring((c \ "rules").as[String])
      val diff = goratingsRankDifference(hc, size, komi, s)
      assert(isCloseTo(diff, (c \ "rankDifference").as[Double], 1e-9), s"$c")
      val adjustment = effectiveRating(1500, Color.Black, diff) - 1500
      assert(isCloseTo(adjustment, (c \ "blackAdjustmentAt1500").as[Double], 1e-6), s"$c")

  test("LiGo's 1-stone game is rated as handicap 0 with its komi (ADR 0021)"):
    List(9, 19).foreach: size =>
      List(Scoring.Territory, Scoring.Area).foreach: s =>
        assertEquals(rankDifference(1, size, 0.5, s), goratingsRankDifference(0, size, 0.5, s))
        List(0, 2, 5, 9).foreach: hc =>
          assertEquals(rankDifference(hc, size, 0.5, s), goratingsRankDifference(hc, size, 0.5, s))
    // under area scoring goratings' own 1-stone case adds a point LiGo's rules don't give
    assert(rankDifference(1, 19, 0.5, Scoring.Area) > goratingsRankDifference(1, 19, 0.5, Scoring.Area))

  test("Glicko-2 with OGS's settings matches goratings' one-game updates"):
    list("glicko").foreach: c =>
      val me = player(triple(c \ "me"))
      val opponent = player(triple(c \ "opponent"))
      val won = (c \ "won").as[Boolean]
      val result = calculator
        .computeGame(
          chess.rating.glicko
            .Game(ByColor(me, opponent), Outcome(Some(if won then Color.White else Color.Black))),
          skipDeviationIncrease = false
        )
        .get
      assertGlicko(result.white.glicko, triple(c \ "after"), s"$c")

  test("rated handicap games match goratings (each player against the opponent's effective rating)"):
    val games = list("handicapGames")
    assertEquals(games.size, 5)
    games.foreach: c =>
      val diff = goratingsRankDifference(
        (c \ "handicap").as[Int],
        (c \ "size").as[Int],
        (c \ "komi").as[Double],
        scoring((c \ "rules").as[String])
      )
      val players = ByColor(white = player(triple(c \ "white")), black = player(triple(c \ "black")))
      val winner = if (c \ "blackWon").as[Boolean] then Color.Black else Color.White
      val after = rateGame(players, Outcome(Some(winner)), diff).get
      assertGlicko(after.black, triple(c \ "blackAfter"), s"black $c")
      assertGlicko(after.white, triple(c \ "whiteAfter"), s"white $c")

  test("the ratings memo's 4-stone game"):
    // 4.5k (Black) beats 0.5d (White), 19x19 Japanese, komi 0.5, both deviation 80
    val players = ByColor(
      white = Player(Glicko(1960.378534, 80, 0.06), 0, None),
      black = Player(Glicko(1579.573482, 80, 0.06), 0, None)
    )
    val diff = rankDifference(4, 19, 0.5, Scoring.Territory)
    val after = rateGame(players, Outcome(Some(Color.Black)), diff).get
    assert(isCloseTo(after.black.rating, 1602.038166, 1e-3))
    assert(isCloseTo(after.white.rating, 1937.119169, 1e-3))
    // without the handicap adjustment the winner would gain far more
    val unadjusted = rateGame(players, Outcome(Some(Color.Black)), 0).get
    assert(isCloseTo(unadjusted.black.rating, 1611.397932, 1e-3))

  test("suggested stones (ADR 0021)"):
    val fiveKyu = Rank.Kyu(5).middleRating
    val oneDan = Rank.Dan(1).middleRating
    assertEquals(suggestedStones(fiveKyu, oneDan, 19), 5)
    assertEquals(suggestedStones(oneDan, fiveKyu, 19), 5)
    assertEquals(suggestedStones(fiveKyu, oneDan, 9), 1)
    assertEquals(suggestedStones(fiveKyu, fiveKyu, 19), 0)
    // round to the nearest stone; caps of 9 on 19x19 and 4 on 9x9
    assertEquals(suggestedStones(ratingOf(20), ratingOf(20.5), 19), 1)
    assertEquals(suggestedStones(ratingOf(20), ratingOf(20.49), 19), 0)
    assertEquals(suggestedStones(ratingOf(20), ratingOf(23), 9), 1)
    assertEquals(suggestedStones(ratingOf(5), ratingOf(38), 19), 9)
    assertEquals(suggestedStones(ratingOf(5), ratingOf(38), 9), 4)
    // 13x13 is not offered for server games (R-SCOPE-1)
    assertEquals(suggestedStones(fiveKyu, oneDan, 13), 0)

  test("provisional from deviation 110, as scalachess counts it"):
    assertEquals(label(Glicko(1580, 110, 0.06)), "5k?")
    assertEquals(label(Glicko(1580, 109.9, 0.06)), "5k")

  test("a draw moves both ratings towards each other"):
    val players = ByColor(
      white = Player(Glicko(1900, 100, 0.06), 0, None),
      black = Player(Glicko(1600, 100, 0.06), 0, None)
    )
    val after = rateGame(players, Outcome(None), 0).get
    assert(after.white.rating < 1900)
    assert(after.black.rating > 1600)

  test("results are capped with OGS's volatility ceiling, not lila's chess one"):
    assertEquals(cap(Glicko(300, 20, 0.14)), Glicko(400, 45, 0.14))
    assertEquals(cap(Glicko(1500, 900, 0.3)), Glicko(1500, 500, 0.15))

  test("a declared starting rating survives being stored and read back (unit 5.4)"):
    val handler = lila.rating.Perf.perfHandler
    val stored = lila.rating.Perf.default.copy(glicko = startingGlicko(Rank.Kyu(5)))
    val back = handler.readTry(handler.writeTry(stored).get).get
    assertEquals(back.glicko.rating.round.toInt, 1580)
    assert(isCloseTo(back.glicko.deviation, 250d, 1e-9), s"deviation ${back.glicko.deviation}")
    assertEquals(back.glicko.volatility, 0.06)
    assertEquals(label(back.glicko), "5k?")
