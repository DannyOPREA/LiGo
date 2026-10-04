package lila.puzzle

import scala.util.Random

import PuzzlePathBuilder.*

class PuzzlePathBuilderTest extends munit.FunSuite:

  private def key(s: String) = PuzzleTheme.Key(s)

  /* 240 puzzles like the first batch: ratings 650 to 2150, all life and death and eye shape, with
   * the goal and the place of the other themes. */
  private lazy val puzzles: Vector[Candidate] =
    Vector.tabulate(240): i =>
      val themes = Set(
        key("lifeAndDeath"),
        key("eyeShape"),
        key(if i % 2 == 0 then "killing" else "living"),
        key(if i % 9 == 0 then "corner" else if i % 4 == 0 then "edge" else "centre")
      )
      Candidate(PuzzleId(f"p$i%04d"), 650d + i * 1500d / 239, vote = (i % 7).toFloat / 10, themes)

  private lazy val paths: List[Path] = build(puzzles, Random(1))

  private def pathsOf(angle: String, tier: PuzzleTier) =
    paths.filter(p => p.angle == angle && p.tier == tier).sortBy(_.ratingMin)

  private def idsOf(angle: String, tier: PuzzleTier) = pathsOf(angle, tier).flatMap(_.ids)

  test("band count: about 25 puzzles a band, at least one, never more bands than puzzles"):
    assertEquals(bandCount(0), 0)
    assertEquals(bandCount(1), 1)
    assertEquals(bandCount(12), 1)
    assertEquals(bandCount(28), 1)
    assertEquals(bandCount(40), 2)
    assertEquals(bandCount(240), 10)
    assertEquals(bandCount(2), 1)

  test("chunkify keeps the order and the first runs take the extra elements"):
    assertEquals(chunkify(Vector(1, 2, 3, 4, 5, 6, 7), 3), List(Vector(1, 2, 3), Vector(4, 5), Vector(6, 7)))
    assertEquals(chunkify(Vector(1, 2, 3, 4), 2), List(Vector(1, 2), Vector(3, 4)))
    assertEquals(chunkify(Vector(1, 2), 0), Nil)
    assertEquals(chunkify(Vector.empty[Int], 1), List(Vector.empty[Int]))

  test("every puzzle is in the `all` path of the mix and of each of its themes"):
    assertEquals(idsOf("mix", PuzzleTier.all).toSet, puzzles.map(_.id).toSet)
    PuzzleTheme.visible
      .map(_.key)
      .filter(_ != PuzzleTheme.mix.key)
      .foreach: theme =>
        val expected = puzzles.filter(_.themes(theme)).map(_.id).toSet
        assertEquals(idsOf(theme.value, PuzzleTier.all).toSet, expected, theme.value)

  test("a puzzle is in one band of an angle: no id twice in a tier"):
    for
      angle <- paths.map(_.angle).distinct
      tier <- PuzzleTier.values
    do
      val ids = idsOf(angle, tier)
      assertEquals(ids.size, ids.distinct.size, s"$angle $tier")

  test("bands are rating-sorted and cover every rating"):
    val bands = pathsOf("mix", PuzzleTier.all)
    assertEquals(bands.size, 10)
    assertEquals(bands.head.ratingMin, lowestRating)
    assertEquals(bands.last.ratingMax, highestRating)
    bands
      .zip(bands.tail)
      .foreach: (a, b) =>
        assertEquals(a.ratingMax, b.ratingMin, "no gap between bands")
    val byId = puzzles.map(c => c.id -> c).toMap
    bands.foreach: band =>
      band.ids.foreach: id =>
        val rating = byId(id).rating
        assert(rating >= band.ratingMin && (rating < band.ratingMax || band.ratingMax == highestRating))
    // sizes within one of each other, around 25
    val sizes = bands.map(_.ids.size)
    assert(sizes.max - sizes.min <= 1, sizes.toString)
    assert(sizes.forall(n => n >= 24 && n <= 25), sizes.toString)

  test("a rating finds a path the way PuzzlePathApi.select looks: min <= key and max >= key"):
    def keyOf(angle: String, tier: PuzzleTier, rating: Int) = f"$angle|${tier.key}|$rating%04d"
    for
      tier <- PuzzleTier.values
      rating <- 100 to 3000 by 7
    do
      val k = keyOf("mix", tier, rating)
      val found = pathsOf("mix", tier).filter(p => p.min <= k && p.max >= k)
      assert(found.nonEmpty, s"no mix path for $tier $rating")

  test("a small angle is one band over every rating"):
    val corner = pathsOf("corner", PuzzleTier.all)
    assertEquals(corner.size, 1)
    assertEquals((corner.head.ratingMin, corner.head.ratingMax), (lowestRating, highestRating))

  test("tiers are nested: top inside good inside all, best-voted first"):
    val byVote = puzzles.map(c => c.id -> c.vote).toMap
    val tops = pathsOf("mix", PuzzleTier.top)
    val goods = pathsOf("mix", PuzzleTier.good)
    val alls = pathsOf("mix", PuzzleTier.all)
    tops
      .zip(goods)
      .zip(alls)
      .foreach:
        case ((top, good), whole) =>
          assert(top.ids.toSet.subsetOf(good.ids.toSet))
          assert(good.ids.toSet.subsetOf(whole.ids.toSet))
          assertEquals(top.ids.size, math.round(whole.ids.size * 0.5).toInt)
          assertEquals(good.ids.size, math.round(whole.ids.size * 0.8).toInt)
          // nothing left out of `top` is better voted than what is in it
          val worstIn = top.ids.map(byVote).min
          whole.ids.filterNot(top.ids.toSet).foreach(id => assert(byVote(id) <= worstIn, s"$id"))

  test("the same seed gives the same paths, and the paths do not depend on the input order"):
    assertEquals(build(puzzles, Random(1)), paths)
    assertEquals(build(puzzles.reverse, Random(1)), paths)
    assertNotEquals(build(puzzles, Random(2)), paths) // the order inside a path is shuffled

  test("nothing in, nothing out; one puzzle gives one path per tier"):
    assertEquals(build(Nil, Random(1)), Nil)
    val one = build(Vector(Candidate(PuzzleId("solo1"), 1500, 0, Set(key("living")))), Random(1))
    assertEquals(one.map(p => (p.angle, p.tier)).toSet.size, 6) // living and mix, three tiers each
    assert(one.forall(_.ids == Vector(PuzzleId("solo1"))))

  test("themes the trainer does not know get no angle"):
    val odd = build(Vector(Candidate(PuzzleId("odd01"), 1500, 0, Set(key("forkAttack")))), Random(1))
    assertEquals(odd.map(_.angle).distinct, List("mix"))

  test("path ids are unique, and the document has what the selection reads"):
    val gen = 1_700_000_000_000L
    val ids = paths.map(_.id(gen))
    assertEquals(ids.size, ids.distinct.size)
    val first = pathsOf("mix", PuzzleTier.top).head
    assertEquals(first.id(gen), f"mix|top|0100-${first.ratingMax}%04d|$gen|0")
    val doc = first.toDoc(gen, puzzles.size)
    assertEquals(doc.string("_id"), Some(first.id(gen)))
    assertEquals(doc.string("min"), Some("mix|top|0100"))
    assertEquals(doc.string("max"), Some(first.max))
    assertEquals(doc.string("tier"), Some("top"))
    assertEquals(doc.string("theme"), Some("mix"))
    assertEquals(doc.long("gen"), Some(gen))
    assertEquals(doc.int("total"), Some(240))
    assertEquals(doc.getAsOpt[List[String]]("ids"), Some(first.ids.map(_.value).toList))

  test("many puzzles at one rating (the generator's top band is 2150): ids stay unique, all reachable"):
    // like the committed set, where 52 of 240 sit at exactly 2150, but twice as big
    val clustered = Vector.tabulate(480): i =>
      val rating = if i < 120 then 2150d else 650d + (i - 120) * 1400d / 359
      Candidate(PuzzleId(f"c$i%04d"), rating, vote = 0, Set(key("lifeAndDeath")))
    val built = build(clustered, Random(1))
    val gen = 1_700_000_000_000L
    val ids = built.map(_.id(gen))
    assertEquals(ids.size, ids.distinct.size, "path ids collide")
    val mixAll = built.filter(p => p.angle == "mix" && p.tier == PuzzleTier.all)
    assert(mixAll.count(_.ratingMin == 2150) >= 2, "the test needs bands sharing a start")
    assertEquals(mixAll.flatMap(_.ids).toSet, clustered.map(_.id).toSet)
    val k = "mix|all|2150"
    assert(mixAll.exists(p => p.min <= k && p.max >= k))

  test("with no votes yet, `top` is not the first half of a band by id"):
    val unvoted = puzzles.map(_.copy(vote = 0))
    val built = build(unvoted, Random(1))
    val band = built.filter(p => p.angle == "mix" && p.tier == PuzzleTier.all).minBy(_.ratingMin)
    val top = built.filter(p => p.angle == "mix" && p.tier == PuzzleTier.top).minBy(_.ratingMin)
    assertNotEquals(top.ids.sortBy(_.value), band.ids.sortBy(_.value).take(top.ids.size))
