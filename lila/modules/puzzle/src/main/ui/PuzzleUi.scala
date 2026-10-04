package lila.puzzle
package ui

import play.api.libs.json.*
import scalalib.paginator.Paginator

import lila.common.Json.given
import lila.core.i18n.I18nKey
import lila.ui.*

import ScalatagsTemplate.{ *, given }

final class PuzzleUi(helpers: Helpers, val bits: PuzzleBits):
  import helpers.{ *, given }

  def show(
      data: JsObject,
      pref: JsObject,
      settings: lila.puzzle.PuzzleSettings,
      langPath: Option[lila.ui.LangPath] = None
  )(using ctx: Context) =
    Page(trans.site.puzzles.txt())
      .css("puzzle")
      .i18n(_.puzzle, _.puzzleTheme)
      .js(
        PageModule(
          "puzzle",
          Json
            .obj(
              "data" -> data,
              "pref" -> pref,
              "showRatings" -> ctx.pref.showRatings,
              "settings" -> Json.obj("difficulty" -> settings.difficulty.key),
              // LiGo: the Go themes have no i18n keys, so the server sends their names and descriptions
              "themeNames" -> bits.themeNames
            )
            .add("themes" -> ctx.isAuth.option(bits.jsonThemes))
        )
      )
      .hrefLangs(langPath)
      .flag(_.zoom)
      .flag(_.zen):
        bits.show.preload

  def themes(all: PuzzleAngle.All)(using ctx: Context) =
    Page(trans.puzzle.puzzleThemes.txt())
      .css("puzzle.page")
      .hrefLangs(lila.ui.LangPath(routes.Puzzle.themes)):
        main(cls := "page-menu")(
          bits.pageMenu("themes", ctx.me),
          div(cls := "page-menu__content box")(
            h1(cls := "box__top")(trans.puzzle.puzzleThemes()),
            standardFlash.map(div(cls := "box__pad")(_)),
            div(cls := "puzzle-themes")(
              all.themes.map(themeCategory)
            )
          )
        )

  private def themeCategory(cat: I18nKey, themes: List[PuzzleTheme.WithCount])(using Context) =
    frag(
      h2(id := cat.value)(cat()),
      div(cls := s"puzzle-themes__list ${cat.value.replace(":", "-")}")(
        themes.map: pt =>
          val url =
            if pt.theme == PuzzleTheme.mix then routes.Puzzle.home
            else routes.Puzzle.show(pt.theme.key.value)
          a(
            cls := "puzzle-themes__link",
            href := (pt.count > 0).option(langHref(url))
          )(
            // LiGo: lichess has an icon per chess theme; the Go themes have none yet (unit 8.7)
            span(
              h3(
                pt.theme.name(),
                em(cls := "puzzle-themes__count")(pt.count.localize)
              ),
              span(pt.theme.description())
            )
          )
      )
    )

  object history:
    import lila.puzzle.PuzzleHistory.{ PuzzleSession, SessionRound }

    def apply(user: User, pager: Paginator[PuzzleSession])(using ctx: Context) =
      val title =
        if ctx.is(user) then trans.puzzle.history.txt()
        else s"${user.username} ${trans.puzzle.history.txt()}"
      Page(title)
        .css("puzzle.dashboard")
        .js(infiniteScrollEsmInit):
          main(cls := "page-menu")(
            bits.pageMenu("history", user.some),
            div(cls := "page-menu__content box box-pad")(
              h1(cls := "box__top")(title),
              div(cls := "puzzle-history")(
                div(cls := "infinite-scroll")(
                  pager.currentPageResults.map(renderSession),
                  pagerNext(pager, np => routes.Puzzle.history(np, user.username.some).url)
                )
              )
            )
          )

    private def renderSession(session: PuzzleSession)(using Context) =
      div(cls := "puzzle-history__session")(
        h2(cls := "puzzle-history__session__title")(
          strong(session.angle.name()),
          momentFromNow(session.puzzles.head.round.date)
        ),
        div(cls := "puzzle-history__session__rounds")(session.puzzles.toList.reverse.map(renderRound))
      )

    private def renderRound(r: SessionRound)(using Context) =
      a(
        cls := List("puzzle-history__round" -> true, "good" -> r.round.win.yes, "bad" -> r.round.win.no),
        href := routes.Puzzle.show(r.puzzle.id.value)
      )(
        span(cls := "puzzle-history__round__puzzle")(bits.miniBoard(r.puzzle, 80)),
        span(cls := "puzzle-history__round__meta")(
          span(cls := "puzzle-history__round__result")(
            if r.round.win.yes then goodTag(trans.puzzle.solved())
            else badTag(trans.puzzle.failed())
          ),
          span(cls := "puzzle-history__round__id")(s"#${r.puzzle.id}")
        )
      )
