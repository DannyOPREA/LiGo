package lila.common

import io.mola.galimatias.URL
import play.api.libs.json.{ Json as PlayJson, * }

object Json:

  export scalalib.json.Json.{ *, given }

  // The game-neutral writers LiGo used from scalachess-play-json, same output (unit 3.17 part 3).
  given Writes[chess.Color] = writeAs(_.name)
  given Writes[chess.Centis] = Writes(c => JsNumber(c.value))
  given OWrites[chess.CorrespondenceClock] = OWrites: c =>
    PlayJson.obj(
      "daysPerTurn" -> c.daysPerTurn,
      "increment" -> c.increment,
      "white" -> c.whiteTime,
      "black" -> c.blackTime
    )

  given userStrReads: Reads[UserStr] = Reads
    .of[String]
    .flatMapResult: str =>
      JsResult.fromTry(UserStr.read(str).toTry(s"Invalid username: $str"))

  given Writes[lila.core.relation.Relation] = writeAs(_.isFollow)

  given Writes[PerfKey] = writeAs(PerfKey.value)

  given Writes[URL] = writeAs(_.toString)

  given Writes[chess.PlayerTitle] = writeAs(_.value)

  given Writes[lila.core.plan.PatronColorResolved] = writeAs(_.value.id)

  given [A: Writes]: OWrites[chess.ByColor[A]] = PlayJson.writes

  import lila.core.LightUser
  given lightUserWrites: OWrites[LightUser] = OWrites(lightUser.write)
  object lightUser:
    def write(u: LightUser): JsObject = writeNoId(u) + ("id" -> JsString(u.id.value))
    def writeNoId(u: LightUser): JsObject = PlayJson
      .obj("name" -> u.name)
      .add("title", u.title)
      .add("flair", u.flair)
      .add("patron", u.isPatron)
      .add("patronColor", u.patronAndColor.map(_.color))
