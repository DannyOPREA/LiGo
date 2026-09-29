package views.mod

import lila.app.UiEnv.{ *, given }
import lila.core.shutup.PublicLine
import lila.mod.IpRender.RenderIp
import lila.mod.UserWithModlog

def communication(
    timeline: lila.api.ModTimeline,
    players: List[(Pov, lila.chat.MixedChat)],
    publicLines: List[PublicLine],
    logins: lila.security.UserLogins.TableData[UserWithModlog],
    appeals: List[lila.appeal.Appeal],
    priv: Boolean
)(using Context, Me, RenderIp) =
  val u = timeline.user
  Page(s"${u.username} communications")
    .css("mod.communication")
    .css(isGranted(_.UserModView).option("mod.user"))
    .js(isGranted(_.UserModView).option(Esm("mod.user"))):
      main(id := "communication", cls := "box box-pad")(
        commUi.commsHeader(u, priv),
        isGranted(_.AccountInfo).option:
          frag(
            div(cls := "mod-zone mod-zone-full none"),
            views.user.mod.otherUsers(u, logins, appeals)(cls := "mod-zone communication__logins")
          )
        ,
        views.mod.timeline.renderComm(timeline),
        // The inbox messages section went with the msg module (unit 3.6).
        priv.option(commUi.privateChats(u, players)),
        commUi.publicChats(u, publicLines, publicLineSource)
      )
