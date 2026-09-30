package views.lobby

import play.api.libs.json.Json

import lila.app.UiEnv.{ *, given }
import lila.app.mashup.Preload.Homepage

object home:

  def apply(homepage: Homepage)(using ctx: Context) =
    import homepage.*
    Page("")
      .copy(fullTitle = s"$siteName • ${trans.site.freeOnlineChess.txt()}".some)
      .i18n(_.variant)
      .js(
        PageModule(
          "lobby",
          Json
            .obj(
              "data" -> data,
              "showRatings" -> ctx.pref.showRatings
            )
            .add("playban", playban.map(lila.playban.TempBan.lobbyJson))
        )
      )
      .css("lobby")
      .graph(
        OpenGraph(
          image = staticAssetUrl("logo/ligo-tile-wide.png").some,
          title = "LiGo: play Go online",
          url = netBaseUrl.into(Url),
          description = trans.site.siteDescription.txt()
        )
      )
      .hrefLangs(lila.ui.LangPath("/")):
        main(
          cls := List(
            "lobby" -> true,
            "lobby-nope" -> (playban.isDefined || currentGame.isDefined)
          )
        )(
          div(cls := "lobby__side")(
            ctx.blind.option(h2(trans.nvui.featuredEvents())),
            // relay spotlights removed with the relay module (unit 3.3), live streams with the
            // streamer module (unit 3.7).
            if ctx.isAuth then
              div(cls := "lobby__timeline")(
                ctx.blind.option(h2(trans.site.timeline())),
                views.timeline.entries(userTimeline)
              )
            else
              div(cls := "about-side")(
                ctx.blind.option(h2(trans.site.about())),
                trans.site.xIsAFreeYLibreOpenSourceChessServer(siteName, trans.site.really.txt()),
                " ",
                a(href := s"${routes.Main.faq}#what")(trans.site.aboutX(siteName), "...")
              )
          ),
          currentGame
            .map(bits.currentGameInfo)
            .orElse:
              playban.map(bits.playbanInfo)
            .getOrElse:
              if ctx.blind then blindLobby(blindGames) else bits.lobbyApp
          ,
          div(cls := "lobby__table")(
            div(cls := "lobby__start")(
              button(cls := "button button-metal lobby__start__button lobby__start__button--hook")(
                trans.site.createLobbyGame()
              ),
              button(cls := "button button-metal lobby__start__button lobby__start__button--friend")(
                trans.site.challengeAFriend()
              )
              // "Play against the computer" went with the engines (unit 3.5).
            )
          ),
          // The donate and swag links, the featured TV game and the news feed went with the plan, tv
          // and feed modules (unit 3.7).
          div(cls := "lobby__puzzle")(puzzle.map(p => views.puzzle.bits.dailyLink(p)())),
          div(cls := "lobby__about")(
            ctx.blind.option(h2(trans.site.about())),
            // LiGo (unit 3.8): "About" opens the FAQ's first question, what LiGo is (the /about CMS
            // page is lichess's); the mobile app and ads links went (LiGo has no app, and "Ads" was
            // lichess's own page).
            a(href := s"${routes.Main.faq}#what")(trans.site.aboutX(siteName)),
            a(href := "/faq")(trans.faq.faqAbbreviation()),
            a(href := "/contact")(trans.contact.contact()),
            a(href := routes.Cms.tos)(trans.site.termsOfService()),
            a(href := "/privacy")(trans.site.privacy()),
            a(href := "/source")(trans.site.sourceCode()),
            a(href := "/credits")("Credits"), // LiGo (unit 9.8)
            views.bits.connectLinks
          )
        )
