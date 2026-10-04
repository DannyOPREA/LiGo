package controllers

import ligo.gorules.SgfReader
import play.api.libs.json.Json

import lila.app.{ *, given }
import lila.common.Json.given
import lila.game.importer.Importer as SgfImporter

/** `/paste` and `/api/import` (unit 7.5, ADR 0023 §2): an SGF record becomes a finished, non-playable Go game
  * with the text kept beside it, which the game page opens in the analysis board.
  */
final class Importer(env: Env) extends LilaController(env):

  // The text is capped at 200 KB by the form and the importer. A form body writes `(`, `;`, `[` and `]`
  // as three characters, so the body itself may be up to three times that before Play refuses it.
  private val sgfBody = parse.formUrlEncoded(maxLength = 3L * SgfReader.maxBytes)

  def importGame = Open:
    Ok.page(views.game.ui.importer(SgfImporter.form))

  def sendGame = OpenOrScopedBody(sgfBody)()(doSendGame)
  def apiSendGame = AnonOrScopedBody(sgfBody)()(doSendGame)

  private def doSendGame(using ctx: BodyContext[Map[String, Seq[String]]]) =
    bindForm(SgfImporter.form)(
      err =>
        negotiate(
          BadRequest.page(views.game.ui.importer(err)),
          jsonFormError(err)
        ),
      sgf =>
        // the rate limit comes before anything reads the file (ADR 0023 §2)
        limit.gameImport(ctx.ip, rateLimited, cost = if ctx.isAuth then 1 else 2):
          env.game.importer
            .importAsGame(sgf, ctx.userId)
            .flatMap:
              case Right(game) =>
                ctx.me
                  .so(env.game.cached.clearNbImportedByCache(_))
                  .flatMap: _ =>
                    negotiate(
                      html = Redirect(routes.Round.watcher(game.id, Color.white)),
                      json = JsonOk:
                        Json.obj(
                          "id" -> game.id,
                          "url" -> s"${env.net.baseUrl}/${game.id}"
                        )
                    )
              case Left(error) =>
                negotiate(
                  BadRequest.page(
                    views.game.ui.importer(
                      SgfImporter.form
                        .fill(sgf)
                        .withError("sgf", lila.core.i18n.I18nKey.site.goCouldNotImportX.txt(error))
                    )
                  ),
                  BadRequest(jsonError(error))
                )
    )
