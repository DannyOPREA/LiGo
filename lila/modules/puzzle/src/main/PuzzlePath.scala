package lila.puzzle

import scala.util.Random
import scalalib.Iso

import lila.db.dsl.{ *, given }
import lila.mon.extensions.*

object PuzzlePath:

  val sep = '|'

  case class Id(value: String):

    val parts = value.split(sep)

    private[puzzle] def tier = PuzzleTier.from(~parts.lift(1))

    def angle = PuzzleAngle.findOrMix(~parts.headOption)

  given Iso.StringIso[Id] = Iso.string(Id.apply, _.value)

final private class PuzzlePathApi(colls: PuzzleColls)(using Executor):

  import BsonHandlers.given
  import PuzzlePath.*

  /* What stresses out the puzzle db
   *
{"t":{"$date":"2025-05-30T07:11:05.938+00:00"},"s":"I",  "c":"COMMAND",  "id":51803,   "ctx":"conn156","msg":"Slow query","attr":{"type":"command","ns":"puzzler.puzzle2_path","command":{"aggregate":"puzzle2_path","pipeline":[{"$match":{"min":{"$lte":"mix|top|1214"},"max":{"$gte":"mix|top|1214"}}},{"$sample":{"size":1}},{"$project":{"_id":true}}],"
explain":false,"allowDiskUse":false,"cursor":{"batchSize":101},"bypassDocumentValidation":false,"readConcern":{"level":"local"},"$db":"puzzler","$readPreference":{"mode":"primary"}},"planSummary":"IXSCAN { min: 1, max: -1 }","planningTimeMicros":81,"keysExamined":18388,"docsExamined":30,"cursorExhausted":true,"numYields":18,"nreturned":1,"queryHas
h":"5B7ADA38","planCacheKey":"7FF0C349","queryFramework":"classic","reslen":286,"locks":{"FeatureCompatibilityVersion":{"acquireCount":{"r":20}},"Global":{"acquireCount":{"r":20}}},"readConcern":{"level":"local","provenance":"clientSupplied"},"writeConcern":{"w":"majority","wtimeout":0,"provenance":"implicitDefault"},"storage":{},"cpuNanos":445997
50,"remote":"172.16.0.45:39998","protocol":"op_msg","durationMillis":44}}
   */
  def nextFor(requester: String)(
      angle: PuzzleAngle,
      tier: PuzzleTier,
      difficulty: PuzzleDifficulty,
      previousPaths: Set[Id],
      compromise: Int = 0
  )(using perf: Perf): Fu[Option[Id]] = {
    val actualTier =
      if tier == PuzzleTier.top && PuzzleDifficulty.isExtreme(difficulty)
      then PuzzleTier.good
      else tier
    colls
      .path:
        _.aggregateOne(_.pri): framework =>
          import framework.*
          val rating = perf.glicko.intRating.map(_ + difficulty.ratingDelta)
          val ratingFlex = (100 + math.abs(1500 - rating.value) / 4) * compromise.atMost(4)
          Match(
            select(angle, actualTier, (rating.value - ratingFlex) to (rating.value + ratingFlex)) ++
              ((compromise != 5 && previousPaths.nonEmpty).so(bdoc("_id".nin(previousPaths))))
          ) -> List(
            Sample(1),
            Project(bid(true))
          )
        .dmap(_.flatMap(_.getAsOpt[Id]("_id")))
      .flatMap:
        case Some(path) => fuccess(path.some)
        case _ if actualTier == PuzzleTier.top =>
          nextFor(requester)(angle, PuzzleTier.good, difficulty, previousPaths)
        case _ if actualTier == PuzzleTier.good && compromise == 2 =>
          nextFor(requester)(angle, PuzzleTier.all, difficulty, previousPaths, compromise = 1)
        case _ if compromise < 5 =>
          nextFor(requester)(angle, actualTier, difficulty, previousPaths, compromise + 1)
        case _ => fuccess(none)
  }.mon:
    lila.mon.puzzle.nextPathFor(angle.categ, requester)

  def select(angle: PuzzleAngle, tier: PuzzleTier, rating: Range) = bdoc(
    "min".lte(f"${angle.key}${sep}${tier}${sep}${rating.max}%04d"),
    "max".gte(f"${angle.key}${sep}${tier}${sep}${rating.min}%04d")
  )

  // The puzzles the paths are built from: all but the ones reported with an issue.
  private val eligible = bdoc(Puzzle.BSONFields.issue.exists(false))

  /* LiGo (ADR 0025 section 3): the paths are stale when they are more than a day old, so rating
   * bands follow the puzzles' ratings, or when they were built for another number of puzzles than
   * there are now (`dev/ligo puzzles load` adds puzzles while lila runs). */
  def isStale: Fu[Boolean] =
    for
      latest <- colls.path(
        _.find(emptyBdoc, bdoc("gen" -> true, "total" -> true).some)
          .sort(sort.desc("gen"))
          .one[Bdoc]
      )
      nbPuzzles <- colls.puzzle(_.countSel(eligible))
    yield latest.fold(true): doc =>
      val tooOld = doc.getAsOpt[Long]("gen").forall(_ < nowInstant.minusDays(1).toMillis)
      tooOld || !doc.getAsOpt[Int]("total").contains(nbPuzzles)

  private val regenerating = java.util.concurrent.atomic.AtomicBoolean(false)

  /** Builds new paths if they are stale, or always with `force`. Safe to call often, and while another call
    * is running: that call's build wins and this one does nothing. Returns the number of paths written.
    */
  def refresh(force: Boolean = false): Fu[Int] =
    if !regenerating.compareAndSet(false, true) then fuccess(0)
    else
      (if force then fuccess(true) else isStale)
        .flatMap: stale =>
          if stale then
            regenerate.map: nb =>
              logger.info(s"Puzzle paths regenerated: $nb paths")
              nb
          else fuccess(0)
        .recover { case e: Exception =>
          logger.error("Puzzle paths regeneration failed", e)
          0
        }
        .andThen { case _ => regenerating.set(false) }

  /** Writes a new generation of paths, then deletes the previous ones, so that selection never finds the
    * collection empty. Returns the number of paths written.
    */
  private def regenerate: Fu[Int] =
    for
      // the count isStale compares with, so one unreadable puzzle doesn't make every tick rebuild
      total <- colls.puzzle(_.countSel(eligible))
      puzzles <- candidates
      nb <- writePaths(puzzles, total)
    yield nb

  private def writePaths(puzzles: Vector[PuzzlePathBuilder.Candidate], total: Int): Fu[Int] =
    val gen = nowInstant.toMillis
    val paths = PuzzlePathBuilder.build(puzzles, Random(gen))
    if paths.isEmpty then fuccess(0)
    else
      for
        _ <- colls.path(_.insert.many(paths.map(_.toDoc(gen, total))))
        _ <- colls.path(_.delete.one(bdoc("gen" -> bdoc("$ne" -> gen))))
      yield paths.size

  private def candidates: Fu[Vector[PuzzlePathBuilder.Candidate]] =
    colls
      .puzzle:
        _.find(eligible, bdoc("themes" -> true, "glicko.r" -> true, "vote" -> true).some)
          .cursor[Bdoc]()
          .listAll()
      .map: docs =>
        docs.flatMap(readCandidate).toVector

  private def readCandidate(doc: Bdoc): Option[PuzzlePathBuilder.Candidate] = for
    id <- doc.string("_id").map(PuzzleId(_))
    rating <- doc.child("glicko").flatMap(_.double("r"))
  yield PuzzlePathBuilder.Candidate(
    id = id,
    rating = rating,
    vote = doc.double("vote").fold(0f)(_.toFloat),
    themes = doc.getAsOpt[List[String]]("themes").getOrElse(Nil).map(PuzzleTheme.Key(_)).toSet
  )
