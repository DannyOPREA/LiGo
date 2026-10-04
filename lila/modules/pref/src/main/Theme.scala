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

object Theme3d extends ThemeObject:

  val all = List(
    Theme("Woodi", "Woodi.webp", Featured.Yes), // 13/8
    Theme("Black-White-Aluminium", "Black-White-Aluminium.webp", Featured.Yes), // 15/5
    Theme("Brushed-Aluminium", "Brushed-Aluminium.webp"), // 5/16
    Theme("China-Blue", "China-Blue.webp", Featured.Yes), // 11/10
    Theme("China-Green", "China-Green.webp", Featured.Yes), // 18/3
    Theme("China-Grey", "China-Grey.webp", Featured.Yes), // 17/4
    Theme("China-Scarlet", "China-Scarlet.webp", Featured.Yes), // 13/7
    Theme("China-Yellow", "China-Yellow.webp"), // 5/15
    Theme("Classic-Blue", "Classic-Blue.webp"), // 5/15
    Theme("Gold-Silver", "Gold-Silver.webp"), // 9/11
    Theme("Green-Glass", "Green-Glass.webp"), // 1/19
    Theme("Light-Wood", "Light-Wood.webp", Featured.Yes), // 18/1
    Theme("Power-Coated", "Power-Coated.webp", Featured.Yes), // 11/9
    Theme("Purple-Black", "Purple-Black.webp"), // 5/15
    Theme("Rosewood", "Rosewood.webp", Featured.Yes), // 12/8
    Theme("Wood-Glass", "Wood-Glass.webp"), // 3/16
    Theme("Marble", "Marble.webp", Featured.Yes), // 14/4
    Theme("Wax", "Wax.webp", Featured.Yes), // 9/11 (featured for an even 12)
    Theme("Jade", "Jade.webp", Featured.Yes) // 10/9
  )
