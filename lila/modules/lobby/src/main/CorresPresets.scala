package lila.lobby

import play.api.libs.json.*
import scalalib.model.Days

import lila.core.game.GoSetups

/** The lobby's two correspondence tiles (ADR 0022 §1, unit 6.5). They are not pools: a click sends a seek
  * with the tile's days per move, 19×19, Japanese rules, the standard komi and no handicap, rated or casual
  * from the chip row, through the usual seek form; lila's seek matching joins the newest compatible seek at
  * once or leaves it waiting. Unit 6.6 draws them.
  */
object CorresPresets:

  case class Preset(days: Days):
    val go = GoSetups.default
    def id = s"${go.size.lines}x${go.size.lines}-${days}d"

  val all: List[Preset] = List(Preset(Days(1)), Preset(Days(3)))

  def json: JsArray = JsArray:
    all.map: p =>
      Json.obj("id" -> p.id, "days" -> p.days.value, "go" -> GoSetups.json(p.go))
