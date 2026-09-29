package views.user

import lila.app.UiEnv.*
import lila.core.perf.UserWithPerfs
import lila.user.LightCount

object list:

  private lazy val ui = lila.user.ui.UserList(helpers, bits)
  export ui.top

  def apply(
      online: List[UserWithPerfs],
      leaderboards: lila.rating.UserPerfs.Leaderboards,
      nbAllTime: List[LightCount]
  )(using Context) =
    ui.page(online, leaderboards, nbAllTime)
