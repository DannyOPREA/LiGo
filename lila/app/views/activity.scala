package views.activity

import lila.app.UiEnv.{ *, given }
import lila.core.perf.UserWithPerfs

private lazy val ui = lila.activity.ui.ActivityUi(helpers)

// The "published N blog posts" entry went with the ublog module (unit 3.6).
def apply(u: UserWithPerfs, as: Iterable[lila.activity.ActivityView])(using ctx: Context) =
  ui(u, as)
