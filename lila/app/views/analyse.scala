package views.analyse

import chess.format.pgn.PgnStr
import play.api.libs.json.{ Json, JsObject }

import lila.app.UiEnv.{ *, given }

val ui = lila.analyse.ui.AnalyseUi(helpers)

object embed:

  def userAnalysis(data: JsObject)(using ctx: EmbedContext) =
    views.base.embed.site(
      title = trans.site.analysis.txt(),
      cssKeys = List("analyse.free.embed"),
      pageModule = ui.bits
        .analyseModule("userAnalysis", Json.obj("data" -> data, "embed" -> true))
        .some,
      csp = _.withWikiBooks,
      i18nModules = List(_.site, _.timeago, _.study, _.preferences)
    )(
      ui.bits.embedUserAnalysisBody,
      views.base.page.ui.inlineJs(ctx.nonce, Nil)
    )

  def lpv(pgn: PgnStr, getPgn: Boolean, title: String, args: JsObject)(using
      ctx: EmbedContext
  ) =
    val opts = Json.obj(
      "menu" -> Json.obj("getPgn" -> Json.obj("enabled" -> getPgn)),
      "i18n" -> Json.obj(
        "flipTheBoard" -> trans.site.flipBoard.txt(),
        "analysisBoard" -> trans.site.analysis.txt(),
        "practiceWithComputer" -> trans.site.practiceWithComputer.txt(),
        "getPgn" -> trans.study.copyChapterPgn.txt(),
        "download" -> trans.site.download.txt()
      )
    ) ++ args
    views.base.embed.minimal(
      title = title,
      cssKeys = List("bits.lpv.embed"),
      modules = esmInitObj("site.lpvEmbed", opts)
    )(
      div(cls := "is2d")(div(pgn))
    )

  def notFound(using EmbedContext) =
    views.base.embed.minimal(
      title = "404 - Game not found",
      cssKeys = List("bits.lpv.embed")
    ):
      div(cls := "not-found")(h1("Game not found"))
