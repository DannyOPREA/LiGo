package controllers

import play.api.libs.json.*
import lila.app.{ *, given }
import lila.i18n.{ LangList, LangPicker }
import lila.pref.ui.DasherJson

final class Dasher(env: Env) extends LilaController(env):

  // LiGo (unit 3.1): lichess's background gallery (public/lifat/background) was removed as
  // non-free, so there is no gallery; the dasher falls back to its image URL input.
  private val gallery: Option[JsValue] = none

  def get = Open:
    negotiateJson:
      Ok:
        Json.obj(
          "lang" -> Json.obj(
            "current" -> ctx.lang.code,
            "accepted" -> LangPicker.allFromRequestHeaders(ctx.req).map(_.code),
            "list" -> LangList.allChoices
          )
          // "streamer" went with the streamer module (unit 3.7).
        ) ++ DasherJson(ctx.pref, gallery)
