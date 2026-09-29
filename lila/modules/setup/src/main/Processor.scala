package lila.setup

import lila.common.Bus
import lila.core.perf.UserWithPerfs
import lila.core.id.SessionId
import lila.lobby.{ SetupBus, Seek }

final private[setup] class Processor(
    gameApi: lila.core.game.GameApi
)(using Executor):

  def hook(
      config: HookConfig,
      sri: lila.core.socket.Sri,
      sid: Option[SessionId],
      blocking: lila.core.pool.Blocking
  )(using me: Option[UserWithPerfs]): Fu[Processor.HookResult] =
    import Processor.HookResult.*
    config.hook(sri, me, sid, blocking) match
      case Left(hook) =>
        fuccess:
          Bus.pub(SetupBus.AddHook(hook))
          Created(hook.id)
      case Right(Some(seek)) => me.fold(fuccess(Refused))(u => createSeekIfAllowed(seek, u.id))
      case _ => fuccess(Refused)

  def createSeekIfAllowed(seek: Seek, owner: UserId): Fu[Processor.HookResult] =
    gameApi.nbPlaying(owner).map { nbPlaying =>
      import Processor.HookResult.*
      if lila.core.game.maxPlaying <= nbPlaying
      then Refused
      else
        Bus.pub(SetupBus.AddSeek(seek))
        Created(seek.id)
    }

object Processor:

  enum HookResult:
    case Created(id: String)
    case Refused
