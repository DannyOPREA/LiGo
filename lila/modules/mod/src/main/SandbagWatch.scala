package lila.mod

import com.github.blemale.scaffeine.Cache
import chess.rating.IntRatingDiff
import chess.IntRating

import lila.report.ReportApi

final private class SandbagWatch(
    reportApi: ReportApi,
    modLogApi: ModlogApi
)(using Executor):

  import SandbagWatch.*
  import Outcome.*

  private val messageOnceEvery = scalalib.cache.OnceEvery[UserId](1.hour)

  def apply(game: Game): Unit = for
    loser <- game.loser.map(_.color)
    if game.rated.yes && !game.sourceIs(_.Api)
    userId <- game.userIds
  do
    (records.getIfPresent(userId), outcomeOf(game, loser, userId)) match
      case (None, Good) =>
      case (Some(record), Good) => setRecord(userId, record + Good, game)
      case (record, outcome) => setRecord(userId, (record | emptyRecord) + outcome, game)

  private def setRecord(userId: UserId, record: Record, game: Game): Funit =
    if record.immaculate then fuccess(records.invalidate(userId))
    else if game.isTournament && userId.is(game.winnerUserId) then
      // if your opponent always resigns to you in a tournament
      // we'll assume you're not boosting
      funit
    else
      records.put(userId, record)
      for
        nbWarnings <- modLogApi.countRecentRatingManipulationsWarnings(userId)
        sandbagCount = record.countSandbagWithLatest
        boostCount = record.samePlayerBoostCount
        sandbagSeriousness = sandbagCount + nbWarnings
        boostSeriousness = boostCount + nbWarnings
        _ <-
          if sandbagCount == 3
          then autoWarn(userId, warning.sandbagAuto)
          else if sandbagCount == 4 then
            game.loserUserId.so:
              reportApi.autoSandbagReport(record.sandbagOpponents, _, sandbagSeriousness)
          else if boostCount == 3
          then autoWarn(userId, warning.boostAuto)
          else if boostCount == 4
          then withWinnerAndLoser(game)((u1, u2) => reportApi.autoBoostReport(u1, u2, boostSeriousness))
          else funit
      yield ()

  private def isCorrespondenceTimeout(game: Game): Boolean =
    game.isCorrespondence && game.status == chess.Status.Timeout

  private def autoWarn(userId: UserId, name: String): Funit =
    fuccess:
      if messageOnceEvery(userId) then lila.common.Bus.pub(lila.core.mod.AutoWarning(userId, name))

  private def withWinnerAndLoser(game: Game)(f: (UserId, UserId) => Funit): Funit =
    (game.winnerUserId, game.loserUserId).tupled.so(f.tupled)

  private val records: Cache[UserId, Record] = lila.memo.CacheApi.scaffeineNoScheduler
    .expireAfterWrite(3.hours)
    .build[UserId, Record]()

  private def outcomeOf(game: Game, loser: Color, userId: UserId): Outcome =
    game
      .player(userId)
      .ifTrue(isSandbagOrBoost(game))
      .flatMap: player =>
        if player.color == loser
        then game.winnerUserId.map(Sandbag.apply)
        else game.loserUserId.map(Boost.apply)
      .getOrElse(Good)

  private def isSandbagOrBoost(game: Game): Boolean = !isCorrespondenceTimeout(game) && {

    def loserRatingGt(r: Int) = game.loser.flatMap(_.rating).exists(_ > IntRating(r))

    val baseMinTurns =
      if loserRatingGt(1800) then 20
      else if loserRatingGt(1600) then 12
      else 8

    import chess.variant.*
    val minTurns = game.variant match
      case Atomic => baseMinTurns / 4
      case KingOfTheHill | ThreeCheck => baseMinTurns / 2
      case _ => baseMinTurns

    game.playedPlies <= minTurns && game.winner.exists(_.ratingDiff.exists(_.positive))
  }

private object SandbagWatch:

  enum Outcome:
    case Good
    case Sandbag(opponent: UserId)
    case Boost(opponent: UserId)

  val maxOutcomes = 7

  case class Record(outcomes: List[Outcome]):

    def +(outcome: Outcome) = copy(outcomes = outcome :: outcomes.take(maxOutcomes - 1))

    def count(outcome: Outcome) = outcomes.count(outcome ==)

    def latest = outcomes.headOption

    def immaculate = outcomes.sizeIs == maxOutcomes && outcomes.forall(Outcome.Good ==)

    def latestIsSandbag = latest.exists:
      case Outcome.Sandbag(_) => true
      case _ => false

    def countSandbagWithLatest: Int = latestIsSandbag.so(outcomes.count:
      case Outcome.Sandbag(_) => true
      case _ => false)

    def sandbagOpponents = outcomes.collect { case Outcome.Sandbag(opponent) => opponent }.distinct

    def samePlayerBoostCount = latest.so:
      case Outcome.Boost(opponent) =>
        outcomes.count:
          case Outcome.Boost(o) if o == opponent => true
          case _ => false
      case _ => 0

  val emptyRecord = Record(Nil)

  // The warnings used to be sent as private messages; since the msg module went (unit 3.6) they
  // are only logged as automatic warnings, under these names.
  object warning:
    val sandbagAuto = "Warning: possible sandbagging"
    val boostAuto = "Warning: possible boosting"
