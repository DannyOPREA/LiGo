package lila.analyse
package ui

import chess.format.{ Uci, Fen }
import play.api.libs.json.*

import lila.ui.*
import lila.ui.ScalatagsTemplate.{ *, given }

final class AnalyseUi(helpers: Helpers):
  import helpers.{ *, given }

  def miniSpan(fen: Fen.Board, color: Color = chess.White, lastMove: Option[Uci] = None) =
    chessgroundMini(fen, color, lastMove)(span)

  // The explorer and tablebase settings went with the explorer (unit 3.4), and the external
  // engine and WebAssembly (browser engine) permissions with the engines (unit 3.5).

  def userAnalysis(
      data: JsObject,
      pov: Pov,
      @annotation.unused chess960PositionNum: Option[Int] = None, // no chess variants since unit 3.17
      withForecast: Boolean = false,
      inlinePgn: Option[String] = None
  )(using ctx: Context): Page =
    val hasWiki = pov.game.synthetic
    Page(trans.site.analysis.txt())
      .css("analyse.free")
      .css(withForecast.option("analyse.forecast"))
      .css(ctx.blind.option("round.nvui"))
      .csp(_.withWikiBooks)
      .js(analyseNvuiTag)
      .js:
        bits.analyseModule(
          "userAnalysis",
          Json
            .obj(
              "data" -> data,
              "wiki" -> hasWiki
            )
            .add("inlinePgn", inlinePgn)
        )
      .i18n(_.study)
      .i18nOpt(ctx.speechSynthesis, _.nvui)
      .i18nOpt(ctx.blind, _.keyboardMove)
      .graph(
        title = "Chess analysis board",
        url = routeUrl(routes.UserAnalysis.index),
        description = "Analyse chess positions and variations on an interactive chess board"
      )
      .flag(_.zoom):
        main(
          cls := List(
            "analyse" -> true,
            "analyse--wiki" -> hasWiki
          )
        )(
          pov.game.synthetic.option(
            st.aside(cls := "analyse__side")(
              hasWiki.option:
                fieldset(cls := "analyse__wiki empty toggle-box toggle-box--toggle", id := "wikibook-field")(
                  legend(tabindex := 0)("WikiBook"),
                  div(cls := "analyse__wiki-text")
                )
            )
          ),
          div(cls := "analyse__board main-board")(chessgroundBoard),
          div(cls := "analyse__tools"),
          div(cls := "analyse__controls")
        )

  def titleFull(pov: Pov)(using ctx: Context) =
    s"${titlePlayerVs(pov.game)} - ${trans.site.analysis.txt()}"

  def titlePlayerVs(g: Game) = s"${playerText(g.whitePlayer)} vs ${playerText(g.blackPlayer)}"

  object bits:

    val dataPanel = attr("data-panel")

    def page(title: String): Page =
      Page(title)
        .flag(_.zoom)
        .flag(_.noRobots)
        .csp(_.withInlineIconFont)

    def analyseModule(mode: "userAnalysis" | "replay", json: JsObject) =
      PageModule("analyse.user", Json.obj("mode" -> mode, "cfg" -> json))

    val embedUserAnalysisBody = div(id := "main-wrap", cls := "is2d")(
      main(cls := "analyse")(
        div(cls := "analyse__board main-board")(chessgroundBoard),
        div(cls := "analyse__tools"),
        div(cls := "analyse__controls")
      )
    )
