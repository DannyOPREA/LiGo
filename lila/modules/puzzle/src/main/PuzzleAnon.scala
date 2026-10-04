package lila.puzzle

import scalalib.ThreadLocalRandom

import lila.db.dsl.*
import lila.memo.CacheApi
import lila.mon.extensions.*

final class PuzzleAnon(
    colls: PuzzleColls,
    cacheApi: CacheApi,
    pathApi: PuzzlePathApi
)(using Executor):

  import BsonHandlers.given

  def getOneFor(angle: PuzzleAngle, diff: PuzzleDifficulty): Fu[Option[Puzzle]] =
    pool
      .get(angle -> diff)
      .map(ThreadLocalRandom.oneOf(_))
      .mon(lila.mon.puzzle.selector.anon.time)
      .addEffect:
        _.foreach: puzzle =>
          lila.mon.puzzle.selector.anon.vote.record(100 + math.round(puzzle.vote * 100))

  private val poolSize = 150

  // LiGo: lichess scales the tier, rating range and number of paths with how many puzzles an angle has
  // (thousands). LiGo's set is a few hundred: every angle uses the `all` tier, a window of 400 rating
  // points around the difficulty's rating, and the whole rating range if that window has no path.
  private val pathSampleSize = 15
  private val centre = 1500
  private val window = 400

  private val pool =
    cacheApi[(PuzzleAngle, PuzzleDifficulty), Vector[Puzzle]](
      initialCapacity = 64,
      name = "puzzle.byTheme.anon"
    ):
      _.expireAfterWrite(1.minute).buildAsyncFuture: (angle, difficulty) =>
        val mid = centre + difficulty.ratingDelta
        fromPaths(angle, (mid - window) to (mid + window)).flatMap: puzzles =>
          if puzzles.nonEmpty then fuccess(puzzles)
          else fromPaths(angle, 0 to 9999)

  private def fromPaths(angle: PuzzleAngle, ratingRange: Range): Fu[Vector[Puzzle]] =
    colls.path:
      _.aggregateList(poolSize): framework =>
        import framework.*
        Match(pathApi.select(angle, PuzzleTier.all, ratingRange)) -> List(
          Sample(pathSampleSize),
          Project(bdoc("puzzleId" -> "$ids", "_id" -> false)),
          Unwind("puzzleId"),
          Sample(poolSize),
          PipelineOperator:
            bdoc(
              "$lookup" -> bdoc(
                "from" -> colls.puzzle.name.value,
                "localField" -> "puzzleId",
                "foreignField" -> "_id",
                "as" -> "puzzle"
              )
            )
          ,
          PipelineOperator:
            bdoc("$replaceWith" -> bdoc("$arrayElemAt" -> barr("$puzzle", 0)))
        )
      .map:
        _.view.flatMap(puzzleReader.readOpt).toVector
