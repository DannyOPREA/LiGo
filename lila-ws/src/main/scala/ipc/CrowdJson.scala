package lila.ws
package ipc

import play.api.libs.json.*

final class CrowdJson(inquirers: Inquirers, lightUserApi: LightUserApi)(using ec: Executor):

  // Rooms with more than 20 users send only the count, not the names. Upstream kept the names of
  // study members; studies were removed in unit 3.3, so no room keeps them now.
  def room(crowd: RoomCrowd.Output): Future[ClientIn.Crowd] =
    val withFewUsers = if crowd.users.sizeIs > 20 then crowd.copy(users = Nil) else crowd
    roomSpectatorsOf(withFewUsers).map: json =>
      ClientIn.Crowd.make(json, withFewUsers.members, withFewUsers.users)

  def round(crowd: RoundCrowd.Output): Future[ClientIn.Crowd] =
    roundSpectatorsOf(crowd).map: spectators =>
      ClientIn.Crowd.make(
        Json
          .obj(
            "white" -> (crowd.players.white > 0),
            "black" -> (crowd.players.black > 0),
            "watchers" -> spectators
          ),
        crowd.size,
        Nil
      )

  private def roomSpectatorsOf(crowd: RoomCrowd.Output): Future[JsObject] =
    if crowd.users.isEmpty then Future.successful(Json.obj("nb" -> crowd.members))
    else
      Future.traverse(crowd.users.filterNot(inquirers.contains))(lightUserApi.get).map { names =>
        Json.obj(
          "nb" -> crowd.members,
          "users" -> names.filterNot(isBotName)
        )
      }

  private def roundSpectatorsOf(crowd: RoundCrowd.Output): Future[JsObject] =
    if crowd.users.isEmpty then Future.successful(JsObject.empty)
    else if crowd.size > 10 then Future.successful(Json.obj("nb" -> crowd.size))
    else
      Future.traverse(crowd.users.filterNot(inquirers.contains))(lightUserApi.get).map { names =>
        Json.obj("users" -> names.filterNot(isBotName))
      }

  private def isBotName(name: User.TitleName) = name.value.startsWith("BOT ")
