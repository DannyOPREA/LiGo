package lila.activity

import com.softwaremill.macwire.*
import com.softwaremill.tagging.*

import lila.common.Bus
import lila.core.config.*
import lila.core.misc.streamer.StreamStart
import lila.core.round.CorresMoveEvent

@Module
final class Env(
    db: lila.db.AsyncDb @@ lila.db.YoloDb,
    gameRepo: lila.core.game.GameRepo,
    lightUserApi: lila.core.user.LightUserApi,
    routeUrl: RouteUrl
)(using ec: Executor, scheduler: Scheduler):

  private lazy val coll = db(CollName("activity2")).failingSilently()

  lazy val write: ActivityWriteApi = wire[ActivityWriteApi]

  lazy val read: ActivityReadApi = wire[ActivityReadApi]

  lazy val jsonView = wire[JsonView]

  Bus.sub[lila.core.game.FinishGame]:
    case lila.core.game.FinishGame(game, _) if !game.aborted => write.game(game)

  Bus.sub[lila.puzzle.Puzzle.UserResult](write.puzzle(_))

  Bus.sub[CorresMoveEvent]:
    case CorresMoveEvent(move, Some(userId), _, _, _) => write.corresMove(move.gameId, userId)
  Bus.sub[lila.core.plan.MonthInc]:
    case lila.core.plan.MonthInc(userId, months) => write.plan(userId, months)
  Bus.sub[lila.core.relation.Follow]:
    case lila.core.relation.Follow(from, to) => write.follow(from, to)

  Bus.sub[StreamStart]:
    case StreamStart(userId, _) => write.streamStart(userId)
