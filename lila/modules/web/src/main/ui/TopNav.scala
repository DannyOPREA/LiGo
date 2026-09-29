package lila.web
package ui

import scalalib.model.Days
import lila.ui.*
import ScalatagsTemplate.{ *, given }

final class TopNav(helpers: Helpers):
  import helpers.{ *, given }

  private def linkTitle(url: String, name: Frag)(using ctx: Context) =
    if ctx.blind then h3(name) else a(href := url)(name)

  def apply(seesClassMenu: Boolean, hasDgt: Boolean)(using ctx: Context) =
    // practice and study menu links went with unit 3.3, chess basics and coordinates with 3.4.
    // The "Learn" heading used to open /learn; it now opens the first link the viewer may see, and
    // the section is left out when there is none (kid accounts don't see coaches).
    val learnLinks = List(
      ctx.kid.no.option(langHref(routes.Coach.all(1)) -> trans.site.coaches()),
      seesClassMenu.option(routes.Clas.index.url -> trans.clas.lichessClasses())
    ).flatten
    st.nav(id := "topnav", cls := "hover")(
      st.section(
        linkTitle(
          "/",
          frag(
            span(cls := "play")(trans.site.play()),
            span(cls := "home")(siteName)
          )
        ),
        div(role := "group")(
          if ctx.noBot then a(href := s"${langHref("/")}?any#hook")(trans.site.createLobbyGame())
          else a(href := "/?any#friend")(trans.site.challengeAFriend()),
          Option.when(ctx.noBot):
            frag(
              hasDgt.option(a(href := routes.DgtCtrl.index)(trans.dgt.dgtBoard())),
              (ctx.kid.no && !ctx.me.exists(_.isPatron)).option:
                a(cls := "community-patron mobile-only", href := routes.Plan.index())(trans.patron.donate())
            )
        )
      ),
      Option.when(ctx.noBot):
        val puzzleUrl = langHref(routes.Puzzle.home.url)
        st.section(
          linkTitle(puzzleUrl, trans.site.puzzles()),
          div(role := "group")(
            a(href := puzzleUrl)(trans.site.puzzles()),
            a(href := langHref(routes.Puzzle.themes))(trans.puzzle.puzzleThemes()),
            a(href := routes.Puzzle.dashboard(Days(30), "home", none))(trans.puzzle.puzzleDashboard())
            // streak, storm and racer links removed with those modes (unit 3.4).
          )
        )
      ,
      learnLinks.headOption.map: (firstUrl, _) =>
        st.section(
          linkTitle(firstUrl, trans.site.learnMenu()),
          div(role := "group")(learnLinks.map((url, name) => a(href := url)(name)))
        ),
      st.section:
        // broadcast link removed with the relay module (unit 3.3).
        frag(
          linkTitle(langHref(routes.Tv.index), trans.site.watch()),
          div(role := "group")(
            a(href := langHref(routes.Tv.index))("Lichess TV"),
            a(href := routes.Tv.games)(trans.site.currentGames()),
            (ctx.kid.no && ctx.noBot).option(a(href := routes.Streamer.index())(trans.site.streamersMenu())),
            ctx.noBot.option(a(href := langHref(routes.Video.index))(trans.site.videoLibrary()))
          )
        )
      ,
      st.section(
        linkTitle(routes.User.list.url, trans.site.community()),
        div(role := "group")(
          a(href := routes.User.list)(trans.site.players()),
          ctx.me.map(me => a(href := routes.Relation.following(me.username))(trans.site.friends())),
          a(href := routes.Team.home())(trans.team.teams()),
          ctx.kid.no.option(a(href := routes.ForumCateg.index)(trans.site.forum())),
          ctx.kid.no.option(a(href := langHref(routes.Ublog.communityAll()))(trans.site.blog())),
          (ctx.kid.no && ctx.me.exists(_.isPatron))
            .option(a(cls := "community-patron", href := routes.Plan.index())(trans.patron.donate()))
        )
      ),
      st.section(
        linkTitle(routes.UserAnalysis.index.url, trans.site.tools()),
        div(role := "group")(
          a(href := routes.UserAnalysis.index)(trans.site.analysis()),
          a(href := routes.Editor.index)(trans.site.boardEditor()),
          a(href := routes.Importer.importGame)(trans.site.importGame()),
          a(href := routes.Search.index())(trans.search.advancedSearch())
        )
      )
    )
