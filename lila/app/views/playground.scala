package views

import play.api.libs.json.Json

import lila.app.UiEnv.*

// LiGo's local Go playground (unit 2.2, docs/PLAN.md Phase 2): a self-contained page, no lila
// module of its own (no server game, no clock, nothing stored). The board and its settings are
// built entirely in ui/playground; this just gives it a page to load into.
object playground:

  def home(using ctx: Context) =
    Page("Playground")
      .css("playground")
      .js(esmInitObj("playground", Json.obj("confirmMoves" -> ctx.pref.confirmMoves))):
        main(id := "playground")(
          p("Loading the Go playground…")
        )
