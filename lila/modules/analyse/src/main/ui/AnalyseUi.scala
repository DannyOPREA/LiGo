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

  /** The Go analysis board (unit 7.4, ADR 0023 §1): the board, the move tree and the SGF box are built in the
    * browser by `ui/analyse` on `libs/board`; the page only gives them somewhere to load. Nothing is stored.
    */
  def userAnalysis(coords: Int)(using ctx: Context): Page =
    Page(trans.site.analysis.txt())
      .css("analyse.free")
      .js(bits.analyseModule("userAnalysis", Json.obj("coords" -> coords)))
      .graph(
        title = "Go analysis board",
        url = routeUrl(routes.UserAnalysis.index),
        description = "Study Go positions and variations: play moves, try lines, open and save SGF files"
      )
      .flag(_.zoom):
        main(cls := "analyse analyse--go")(
          div(cls := "analyse__board main-board")(div(cls := "analyse__go-board")),
          div(cls := "analyse__tools"),
          div(cls := "analyse__controls")
        )

  def titleFull(pov: Pov)(using ctx: Context) =
    val openingName = gameOpening(pov.game, ctx.isAuth).fold(trans.site.analysis.txt())(_.name)
    s"${titlePlayerVs(pov.game)} - $openingName"

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
