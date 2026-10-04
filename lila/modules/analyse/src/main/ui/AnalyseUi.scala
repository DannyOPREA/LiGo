package lila.analyse
package ui

import play.api.libs.json.*

import lila.ui.*
import lila.ui.ScalatagsTemplate.*

final class AnalyseUi(helpers: Helpers):
  import helpers.{ *, given }

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

  /** A stored game in the analysis board (unit 7.5, ADR 0023 §2): the same page, loaded with the game's SGF.
    * An import's is the text it was stored with, so its variations and comments show; a live game's is the
    * server's record, with the move delay for a game in play. The browser reads it with `ui/analyse`'s
    * `readTree`, like a file the player opens.
    */
  def gameAnalysis(pov: Pov, sgf: String, coords: Int)(using ctx: Context): Page =
    val game = Json.obj(
      "url" -> routes.Round.watcher(pov.gameId, pov.color).url,
      "sgfUrl" -> s"${routes.Game.exportOne(pov.gameId).url}?format=sgf"
    )
    Page(titleFull(pov))
      .css("analyse.free")
      .js(bits.analyseModule("userAnalysis", Json.obj("coords" -> coords, "sgf" -> sgf, "game" -> game)))
      .graph(
        title = titleFull(pov),
        url = routeUrl(routes.UserAnalysis.game(pov.gameId, pov.color)),
        description = "Study a Go game: its moves, variations and comments"
      )
      .flag(_.zoom)
      .flag(_.noRobots):
        main(cls := "analyse analyse--go")(
          div(cls := "analyse__board main-board")(div(cls := "analyse__go-board")),
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
