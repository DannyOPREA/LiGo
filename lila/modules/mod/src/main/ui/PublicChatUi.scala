package lila.mod
package ui

import lila.chat.{ ChatTimeout, UserChat }
import lila.ui.*

import ScalatagsTemplate.{ *, given }

final class PublicChatUi(helpers: Helpers)(modMenu: Context ?=> Frag, highlightBad: String => Frag):
  import helpers.{ *, given }

  def apply(
      relayChats: PublicChats[lila.core.relay.RoundIdName]
  )(using Context) =
    Page("Public Chats")
      .css("mod.publicChats")
      .js(Esm("bits.publicChats")):
        main(cls := "page-menu")(
          modMenu,
          div(id := "comm-wrap")(
            div(id := "communication", cls := "page-menu__content public-chat box box-pad")(
              div(
                h2("Broadcast Chats"),
                div(cls := "player_chats"):
                  relayChats.map: (relay, chat) =>
                    div(cls := "game", dataChan := "study", dataRoom := relay.id):
                      chatOf(relayTitle(relay), chat)
              ),
              div(cls := "timeout-modal none")(
                h2(cls := "username")("username"),
                p(cls := "text")("text"),
                div(cls := "continue-with"):
                  ChatTimeout.Reason.all.map: reason =>
                    button(cls := "button", value := reason.key)(reason.shortName)
              )
            )
          )
        )

  private val dataRoom = attr("data-room")
  private val dataChan = attr("data-chan")

  private def chatOf(titleFragment: Frag, chat: UserChat)(using Context) =
    frag(
      titleFragment,
      div(cls := "chat"):
        chat.lines
          .filter(_.isVisible)
          .map: line =>
            div(
              cls := List(
                "line" -> true,
                "lichess" -> line.isLichess
              )
            )(
              userIdLink(UserStr(line.author).id.some, withOnline = false, withTitle = false),
              " ",
              highlightBad(line.text)
            )
    )

  private def relayTitle(relay: lila.core.relay.RoundIdName) =
    a(cls := "title", href := routes.RelayRound.show("-", "-", relay.id))(relay.name)
