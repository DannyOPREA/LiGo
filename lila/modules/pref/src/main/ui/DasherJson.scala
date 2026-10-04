package lila.pref
package ui

import play.api.libs.json.*

import lila.common.Json.given
import lila.ui.Context

object DasherJson:

  def apply(pref: Pref, gallery: Option[JsValue])(using ctx: Context): JsObject =
    Json.obj(
      "user" -> ctx.me.map(_.light),
      "sound" -> Json.obj(
        "list" -> SoundSet.list.map { set =>
          s"${set.key} ${set.name}"
        }
      ),
      "background" -> Json
        .obj(
          "current" -> Pref.Bg.asString.get(pref.bg),
          "image" -> pref.bgImgUrl
        )
        .add("gallery", gallery),
      // LiGo: goban's board and stone themes (ADR 0026 §3); no 3D boards or pieces.
      "board" -> Json.obj(
        "current" -> pref.currentTheme.name,
        "list" -> Theme.all
      ),
      "piece" -> Json.obj(
        "current" -> pref.currentPieceSet.name,
        "list" -> PieceSet.all
      )
    )
