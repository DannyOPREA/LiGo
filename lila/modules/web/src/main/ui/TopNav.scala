package lila.web
package ui

import scalalib.model.Days
import lila.ui.*
import ScalatagsTemplate.{ *, given }

final class TopNav(helpers: Helpers):
  import helpers.{ *, given }

  private def linkTitle(url: String, name: Frag)(using ctx: Context) =
    if ctx.blind then h3(name) else a(href := url)(name)

  def apply()(using ctx: Context) =
    // Removed menu links: practice and study (unit 3.3), chess basics and coordinates (3.4),
    // classes (3.6), coaches, TV, current games, streamers, videos, donations, the board editor
    // and advanced search (3.7). With no link left, the Learn and Watch sections went too.
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
          else a(href := "/?any#friend")(trans.site.challengeAFriend())
          // The DGT board link went with the DGT page (unit 3.18): it plays chess on a chess board.
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
      st.section(
        linkTitle(routes.User.list.url, trans.site.community()),
        // Teams, the forum and blogs went with unit 3.6.
        div(role := "group")(
          a(href := routes.User.list)(trans.site.players()),
          ctx.me.map(me => a(href := routes.Relation.following(me.username))(trans.site.friends()))
        )
      ),
      st.section(
        linkTitle(routes.UserAnalysis.index.url, trans.site.tools()),
        div(role := "group")(
          a(href := routes.UserAnalysis.index)(trans.site.analysis()),
          a(href := routes.Importer.importGame)(trans.site.importGame())
        )
      )
    )
