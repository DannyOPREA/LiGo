package lila.activity

import play.api.libs.json.*

import lila.activity.activities.*
import lila.common.Json.{ *, given }
import lila.core.game.LightPov
import lila.core.rating.{ RatingProg, Score }
import lila.rating.PerfType

final class JsonView(
    routeUrl: lila.core.config.RouteUrl
):

  private object Writers:
    given OWrites[TimeInterval] = OWrites: i =>
      Json.obj("start" -> i.start, "end" -> i.end)
    given Writes[PerfType] = writeAs(_.key)
    given Writes[RatingProg] = Json.writes
    given Writes[Score] = Json.writes
    given OWrites[Games] = OWrites: games =>
      JsObject:
        games.value.toList
          .sortBy((_, s) => -s.size)
          .map: (pk, score) =>
            pk.value -> Json.toJson(score)

    given Writes[chess.variant.Variant] = writeAs(_.key)

    given Writes[Puzzles] = writeWrap("score")(_.value)
    given Writes[Storm] = Json.writes
    given Writes[Racer] = Json.writes
    given Writes[Streak] = Json.writes
    given lightPlayerWrites: OWrites[lila.core.game.LightPlayer] = OWrites: p =>
      Json
        .obj()
        .add("aiLevel" -> p.aiLevel)
        .add("user" -> p.userId)
        .add("rating" -> p.rating)

    given OWrites[lila.core.game.Player] = lightPlayerWrites.contramap(_.light)

    given OWrites[LightPov] = OWrites: p =>
      Json.obj(
        "id" -> p.game.id,
        "color" -> p.color,
        "url" -> routeUrl(routes.Round.watcher(p.game.id, p.color)),
        "opponent" -> p.opponent
      )
    given Writes[FollowList] = Json.writes
    given Writes[Follows] = Json.writes
    given Writes[Patron] = Json.writes
  import Writers.given

  def apply(a: ActivityView): Fu[JsObject] =
    fuccess:
      Json
        .obj("interval" -> a.interval)
        .add("games", a.games)
        .add("puzzles", a.puzzles)
        .add("storm", a.storm)
        .add("racer", a.racer)
        .add("streak", a.streak)
        .add(
          "correspondenceMoves",
          a.corresMoves.map: (nb, povs) =>
            Json.obj("nb" -> nb, "games" -> povs)
        )
        .add(
          "correspondenceEnds",
          a.corresEnds.map:
            _.map { case (pk, (score, povs)) =>
              pk.value -> Json.obj("score" -> score, "games" -> povs)
            }
        )
        .add("follows" -> a.follows)
        .add("patron" -> a.patron)
        .add("stream" -> a.stream)
