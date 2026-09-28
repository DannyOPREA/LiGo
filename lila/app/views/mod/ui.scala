package views.mod

import lila.app.UiEnv.{ *, given }
import lila.mod.ui.*
import lila.shutup.Analyser.highlightBad
import lila.core.chat.PublicSource
import lila.common.ClientName

lazy val ui = ModUi(helpers)
lazy val userTable = ModUserTableUi(helpers, ui)
lazy val user = ModUserUi(helpers, ui, env.mod.mailerEventsUrl)
lazy val gamify = GamifyUi(helpers)(views.mod.ui.menu("gamify"))
lazy val publicChat = PublicChatUi(helpers)(views.mod.ui.menu("public-chat"), highlightBad)
lazy val commUi = ModCommUi(helpers)(highlightBad)
lazy val inquiryUi = ModInquiryUi(helpers)(publicLineSource, env.mod.presets.getPmPresets, highlightBad)

val timeline = lila.api.ui.ModTimelineUi(helpers)(publicLineSource = publicLineSource)

// PublicSource.Tournament/Simul/Swiss can no longer occur (unit 3.2 removed those features), but
// the enum cases stay in lila.core.chat for old stored chat lines; render them like any unknown
// game-scoped source rather than deleting the cases wholesale.
private def publicLineSource(source: PublicSource)(using Translate, ClientName): Tag = source match
  case PublicSource.Team(id) => teamLink(id)
  case PublicSource.Watcher(id) => a(href := routes.Round.watcher(id, Color.white))("Game #", id)
  case PublicSource.Player(id) => a(href := routes.Round.watcher(id, Color.white))("Game #", id)
  case PublicSource.Study(id) => a(href := routes.Study.show(id))("Study #", id)
  case PublicSource.Forum(id) => a(href := routes.ForumPost.redirect(id))("Forum #", id)
  case PublicSource.Ublog(id) => a(href := routes.Ublog.redirect(id))("User blog #", id)
  case PublicSource.Relay(id) => a(href := routes.RelayRound.show("-", "-", id))("Broadcast #", id)
  case PublicSource.Tournament(id) => em("tournament #", id)
  case PublicSource.Simul(id) => em("simul #", id)
  case PublicSource.Swiss(id) => em("swiss #", id)

def permissions(u: User)(using Context, Me) =
  ui.permissions(u, lila.security.Permission.categorized)
