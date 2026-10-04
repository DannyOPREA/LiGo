package views.analyse

import lila.app.UiEnv.*

val ui = lila.analyse.ui.AnalyseUi(helpers)

object embed:

  def notFound(using EmbedContext) =
    views.base.embed.minimal(
      title = "404 - Game not found",
      cssKeys = List("bits.not-found-embed")
    ):
      div(cls := "not-found")(h1("Game not found"))
