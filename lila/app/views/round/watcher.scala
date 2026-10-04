package views.round

import play.api.libs.json.{ JsObject, Json }

import lila.app.UiEnv.{ *, given }
import lila.round.RoundGame.secondsSinceCreation

def watcher(
    pov: Pov,
    data: JsObject,
    cross: Option[lila.game.Crosstable.WithMatchup],
    userTv: Option[User] = None,
    chatOption: Option[lila.chat.UserChat.Mine],
    bookmarked: Boolean
)(using ctx: Context) =

  val chatJson = chatOption.map: c =>
    views.chat.json(
      c.chat,
      c.lines,
      name = trans.site.spectatorRoom.txt(),
      timeout = c.timeout,
      withNoteAge = ctx.isAuth.option(pov.game.secondsSinceCreation),
      public = true,
      resource = lila.core.chat.PublicSource.Watcher(pov.gameId),
      opponentId = pov.opponent.userId
    )

  ui.RoundPage(s"${gameVsText(pov.game, withRatings = ctx.pref.showRatings)} • spectator")
    .js(
      PageModule(
        "round",
        Json.obj(
          "data" -> data,
          "chat" -> chatJson
        )
      )
    )
    .graph(ui.povOpenGraph(pov))
    .flag(_.zen):
      main(cls := "round")(
        st.aside(cls := "round__side")(
          side(pov, userTv, bookmarked),
          chatOption.map(_ => views.chat.frag)
        ),
        ui.roundAppPreload(pov),
        div(cls := "round__underboard")(views.game.ui.crosstable.option(cross, pov.game)),
        div(cls := "round__underchat")(underchat(pov.game))
      )

def crawler(pov: Pov)(using Context) =
  Page(gameVsText(pov.game, withRatings = true))
    .css("round")
    .flag(_.zoom)
    .graph(ui.povOpenGraph(pov)):
      main(cls := "round")(
        st.aside(cls := "round__side")(
          views.game.side.meta(pov, bookmarked = false),
          div(
            h1(titleGame(pov.game)),
            p(ui.describePov(pov))
          )
        ),
        // crawlers get the game's description; its board is drawn by the page's script (unit 3.18)
        div(cls := "round__board main-board")
      )
