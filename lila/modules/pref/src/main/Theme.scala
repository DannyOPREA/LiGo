package lila.pref

import play.api.libs.json.*
import lila.common.Json.given

case class Theme private[pref] (name: String, file: String, featured: Featured = Featured.No):

  override def toString = name

sealed trait ThemeObject:
  given Writes[Theme] = Json.writes[Theme]

  def default = all.head
  val all: List[Theme]

  lazy val allByName = all.mapBy(_.name)

  def apply(name: String): Theme = allByName.getOrElse(name, default)
  def apply(name: Option[String]): Theme = name.fold(default)(apply)

  def contains(name: String) = allByName contains name

object Theme extends ThemeObject:

  // LiGo: goban's board themes drawn from code alone, named as goban names them (ADR 0026 §3; the same
  // list as BOARD_THEMES in libs/board/src/themes.ts). They have no picture file. A stored chess name
  // falls back to the default.
  val all = List(
    Theme("Plain", "", Featured.Yes),
    Theme("Book", "", Featured.Yes),
    Theme("Night Play", "", Featured.Yes),
    Theme("HNG", "", Featured.Yes),
    Theme("HNG Night", "", Featured.Yes)
  )
