package lila.puzzle

import lila.db.dsl.{ *, given }
import lila.memo.CacheApi.*

import Puzzle.BSONFields as F
import lila.core.misc.puzzle.DailyChange

final private[puzzle] class DailyPuzzle(
    colls: PuzzleColls,
    cacheApi: lila.memo.CacheApi
)(using Executor, Scheduler):

  import BsonHandlers.given

  private val cache =
    cacheApi.unit[Option[DailyPuzzle.WithHtml]]("puzzle.daily"):
      _.refreshAfterWrite(1.minutes).buildAsyncTimeoutZero()(_ => find)

  def get: Fu[Option[DailyPuzzle.WithHtml]] = cache.getUnit

  private def find: Fu[Option[DailyPuzzle.WithHtml]] =
    findCurrent
      .orElse(findNew)
      .recover { case e: Exception =>
        logger.error("find daily", e)
        none
      }
      .map(_.map(makeDaily))

  // LiGo: no game and no chess board to render: the page shows a small picture of the position
  private def makeDaily(puzzle: Puzzle) = DailyPuzzle.WithHtml(puzzle, Html(PuzzleMiniBoard.svg(puzzle)))

  private def findCurrent = colls.puzzle:
    _.find(bdoc(F.day.gt(nowInstant.minusDays(1))))
      .sort(sort.desc(F.day))
      .one[Puzzle]

  /* LiGo: lichess takes a hard (2150 to 2300) and well-played puzzle. LiGo's puzzles have few plays
   * and the set is small, so it takes a random puzzle of middling difficulty that has never been the
   * daily one, then a random one of any difficulty, and when every puzzle has had its day, the one
   * whose day is the oldest. */
  private def findNew: Fu[Option[Puzzle]] =
    val neverDaily = bdoc(F.day.exists(false), F.issue.exists(false))
    val middling = neverDaily ++ bdoc("glicko.r" -> bdoc("$gte" -> 1000, "$lte" -> 1800))
    sampleOne(middling)
      .orElse(sampleOne(neverDaily))
      .orElse(oldest)
      .flatMapz: puzzle =>
        colls
          .puzzle(_.updateField(bid(puzzle.id), F.day, nowInstant))
          .inject(puzzle.some)
          .addEffect(_ => lila.common.Bus.pub(DailyChange(puzzle.id)))

  private def sampleOne(selector: Bdoc): Fu[Option[Puzzle]] =
    colls
      .puzzle:
        _.aggregateOne(): framework =>
          import framework.*
          Match(selector) -> List(Sample(1))
      .map(_.flatMap(puzzleReader.readOpt))

  private def oldest: Fu[Option[Puzzle]] =
    colls.puzzle:
      _.find(bdoc(F.issue.exists(false)))
        .sort(sort.asc(F.day))
        .one[Puzzle]

object DailyPuzzle:
  type Try = () => Fu[Option[DailyPuzzle.WithHtml]]

  case class WithHtml(puzzle: Puzzle, html: Html)
