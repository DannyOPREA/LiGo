package lila.ws

import io.netty.handler.codec.http.HttpResponseStatus

import util.RequestHeader

final class Router(controller: Controller):

  def apply(req: RequestHeader): Controller.Response =
    req.path.drop(1).split('/') match
      case Array("socket") | Array("socket", _) => controller.site(req)
      case Array("analysis", "socket") => controller.site(req)
      case Array("analysis", "socket", _) => controller.site(req)
      case Array("api", "socket") => controller.api(req)
      case Array("lobby", "socket") => controller.lobby(req)
      case Array("lobby", "socket", _) => controller.lobby(req)
      // study socket route removed with the study module (unit 3.3).
      case Array("watch", id, _, _) => controller.roundWatch(Game.Id(id), req)
      case Array("play", id, _) => controller.roundPlay(Game.FullId(id), req)
      case Array("challenge", id, "socket", _) => controller.challenge(Challenge.Id(id), req)
      case Array("team", id) => controller.team(Team.Id(id), req)
      case _ => Future.successful(Left(HttpResponseStatus.NOT_FOUND))
