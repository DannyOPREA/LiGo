package lila.puzzle

import reactivemongo.api.bson.{ BSONArray, BSONString }
import scala.util.Random

import lila.db.dsl.*

/* LiGo (ADR 0025 section 3): lichess builds `puzzle2_path` with a cron script outside lila
 * (cron/mongodb-puzzle-regen-paths.js). LiGo's set is small, so the same idea is a function here
 * and a job in PuzzlePathApi.
 *
 * A path is the list of puzzle ids a player walks through in one go. For every angle (each theme
 * that has puzzles, plus the mix) the puzzles are sorted by rating and cut into rating bands of
 * about `bandSize` puzzles each, so a player's rating picks the band around it. Each band gets one
 * path per tier: `top` holds the best-voted half of the band, `good` the best-voted four fifths,
 * `all` every puzzle. The ids inside a path are shuffled, so a band is not always walked in the
 * same order.
 */
object PuzzlePathBuilder:

  /** What the build needs to know about a puzzle. */
  case class Candidate(id: PuzzleId, rating: Double, vote: Float, themes: Set[PuzzleTheme.Key])

  /** One path document, before it has a generation. */
  case class Path(
      angle: PuzzleAngle.Key,
      tier: PuzzleTier,
      ratingMin: Int,
      ratingMax: Int,
      ids: Vector[PuzzleId],
      index: Int // the band's place in its angle: two bands can share a rating range (equal ratings)
  ):
    import PuzzlePath.sep

    // `min` and `max` are what PuzzlePathApi.select compares against: angle|tier|rating, the rating
    // padded to 4 digits so strings sort like numbers.
    def min = f"$angle$sep${tier.key}$sep$ratingMin%04d"
    def max = f"$angle$sep${tier.key}$sep$ratingMax%04d"

    def id(gen: Long): String = f"$angle$sep${tier.key}$sep$ratingMin%04d-$ratingMax%04d$sep$gen$sep$index"

    /** `total` is how many puzzles the whole build covered: PuzzlePathApi.isStale compares it. */
    def toDoc(gen: Long, total: Int): Bdoc = bdoc(
      "_id" -> id(gen),
      "min" -> min,
      "max" -> max,
      "ids" -> BSONArray(ids.map(i => BSONString(i.value))),
      "tier" -> tier.key,
      "theme" -> angle,
      "gen" -> gen,
      "total" -> total
    )

  // About 25 puzzles in a band: the set (240 at first) is far smaller than lichess's millions, where
  // a band holds thousands. 25 is one sitting's worth, and keeps a few bands per big angle (about
  // ten for the mix), so rating still picks the puzzle. An angle with fewer than ~38 puzzles is a
  // single band that covers every rating.
  val bandSize = 25

  // The share of a band each tier keeps, best-voted first. lichess keeps 20%, 50% and 95%; with a
  // small set 5% would drop puzzles nobody has voted on yet, and the `all` tier must reach every
  // puzzle.
  val tierShares: List[(PuzzleTier, Double)] = List(
    PuzzleTier.top -> 0.5,
    PuzzleTier.good -> 0.8,
    PuzzleTier.all -> 1.0
  )

  // the rating limits of the first and last band, as lichess's script uses
  val lowestRating = 100
  val highestRating = 9999

  def bandCount(nbPuzzles: Int): Int =
    if nbPuzzles <= 0 then 0
    else math.round(nbPuzzles.toDouble / bandSize).toInt.atLeast(1).atMost(nbPuzzles)

  /** Cuts `xs` into `nb` runs as even as possible (the first ones one longer), keeping the order. */
  def chunkify[A](xs: Vector[A], nb: Int): List[Vector[A]] =
    if nb <= 0 then Nil
    else
      val base = xs.size / nb
      val extra = xs.size % nb
      (0 until nb)
        .foldLeft((0, List.empty[Vector[A]])):
          case ((from, acc), i) =>
            val len = base + (if i < extra then 1 else 0)
            (from + len, xs.slice(from, from + len) :: acc)
        ._2
        .reverse

  /** The paths of one angle: its puzzles by rating band, then by tier. */
  def pathsOf(angle: PuzzleAngle.Key, puzzles: Seq[Candidate], rng: Random): List[Path] =
    val byRating = puzzles.sortBy(c => (c.rating, c.id.value)).toVector
    val bands = chunkify(byRating, bandCount(byRating.size))
    // a band runs up to the lowest rating of the next one, so no rating falls between two bands
    val starts = bands.map(band => math.floor(band.head.rating).toInt)
    bands.zipWithIndex.flatMap: (band, bandIndex) =>
      val ratingMin = if bandIndex == 0 then lowestRating else starts(bandIndex).atLeast(lowestRating)
      val ratingMax =
        if bandIndex == bands.size - 1 then highestRating else starts(bandIndex + 1).atLeast(ratingMin)
      // shuffled first so equal votes (every puzzle, before anyone votes) don't make `top` the
      // first half by id; sortBy is stable
      val bestVotedFirst = rng.shuffle(band).sortBy(-_.vote.toDouble)
      tierShares.map: (tier, share) =>
        val nb = math.round(bestVotedFirst.size * share).toInt.atLeast(1).atMost(bestVotedFirst.size)
        Path(
          angle = angle,
          tier = tier,
          ratingMin = ratingMin,
          ratingMax = ratingMax,
          ids = rng.shuffle(bestVotedFirst.take(nb).map(_.id)),
          index = bandIndex
        )

  /** Every path: one angle per theme that has puzzles, and the mix of all of them. */
  def build(puzzles: Seq[Candidate], rng: Random): List[Path] =
    val themed = PuzzleTheme.visible
      .map(_.key)
      .filter(key => key != PuzzleTheme.mix.key && puzzles.exists(_.themes(key)))
      .map(key => key.value -> puzzles.filter(_.themes(key)))
    (themed :+ (PuzzleTheme.mix.key.value -> puzzles)).flatMap: (angle, ofAngle) =>
      pathsOf(angle, ofAngle, rng)
