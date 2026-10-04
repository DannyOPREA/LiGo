package lila.game

import org.apache.pekko.stream.scaladsl.*
import play.api.libs.json.*

import lila.common.Bus
import lila.common.Json.given
import lila.core.game.{ FinishGame, Game, StartGame }
import lila.core.LightUser

final class GamesByUsersStream(gameRepo: lila.game.GameRepo)(using
    org.apache.pekko.stream.Materializer,
    Executor
):

  def apply(userIds: Set[UserId], withCurrentGames: Boolean): Source[JsValue, ?] =
    if userIds.sizeIs < 2 then Source.empty
    else
      val initialGames = if withCurrentGames then currentGamesSource(userIds) else Source.empty
      val startStream =
        Source.queue[Game](150, org.apache.pekko.stream.OverflowStrategy.dropHead).mapMaterializedValue {
          queue =>
            def matches(game: Game) = game.twoUserIds.exists: (u1, u2) =>
              userIds(u1) && userIds(u2)
            val subStart = Bus.sub[StartGame]:
              case StartGame(game, _) if matches(game) => queue.offer(game)
            val subFinish = Bus.sub[FinishGame]:
              case FinishGame(game, _) if matches(game) => queue.offer(game)
            queue
              .watchCompletion()
              .addEffectAnyway:
                Bus.unsub[StartGame](subStart)
                Bus.unsub[FinishGame](subFinish)
        }
      initialGames
        .concat(startStream)
        .map(GameStream.toJson(none))

  private def currentGamesSource(userIds: Set[UserId]): Source[Game, ?] =
    gameRepo.ongoingByUserIdsCursor(userIds).documentSource().throttle(30, 1.second)

object GameStream:

  def toJson(lightUserGet: Option[LightUser.GetterSync])(g: Game) =
    Json
      .obj(
        "id" -> g.id,
        "rated" -> g.rated,
        "speed" -> g.speed.key,
        "perf" -> g.perfKey,
        "createdAt" -> g.createdAt,
        "status" -> g.status.id,
        "statusName" -> g.status.name,
        "players" -> JsObject(g.players.mapList: p =>
          val user = for
            getUser <- lightUserGet
            id <- p.userId
            user <- getUser(id)
          yield user
          p.color.name -> Json
            .obj(
              "userId" -> p.userId,
              "rating" -> p.rating
            )
            .add("name" -> user.map(_.name))
            .add("provisional" -> p.provisional)
            .add("goRank" -> Namer.ratingString(p)) // LiGo (unit 5.5)
            .add("ai" -> p.aiLevel))
      )
      // a Go game has its setup instead of a chess variant (unit 3.16)
      .add("go" -> JsonView.goSetup(g.go).some)
      .add("winner" -> g.winnerColor.map(_.name))
      .add("clock" -> g.clock.map: clock =>
        Json.obj(
          "initial" -> clock.limitSeconds,
          "increment" -> clock.incrementSeconds
        ))
      .add("daysPerTurn" -> g.daysPerTurn)
