package lila.pref

import play.api.libs.json.*
import lila.common.Json.given

opaque type Featured = Boolean
object Featured extends YesNo[Featured]

case class PieceSet private[pref] (name: String, featured: Featured = Featured.No):

  override def toString = name

sealed trait PieceSetObject:
  given Writes[PieceSet] = Json.writes[PieceSet]

  def default = all.head
  val all: List[PieceSet]

  lazy val allByName = all.mapBy(_.name)

  def get(name: String): PieceSet = allByName.getOrElse(name, default)
  def get(name: Option[String]): PieceSet = name.fold(default)(get)

  def contains(name: String) = allByName contains name

object PieceSet extends PieceSetObject:

  // LiGo: goban's stone themes drawn from code alone, black and white as goban pairs them (ADR 0026 §3;
  // the same list as STONE_THEMES in libs/board/src/themes.ts). A stored chess name falls back to the
  // default.
  val all = List(
    PieceSet("Plain", Featured.Yes),
    PieceSet("Slate & Shell", Featured.Yes),
    PieceSet("Glass", Featured.Yes),
    PieceSet("Worn Glass", Featured.Yes),
    PieceSet("Night", Featured.Yes)
  )

object PieceSet3d extends PieceSetObject:

  val all = List(
    PieceSet("Basic", Featured.Yes),
    PieceSet("Wood", Featured.Yes),
    PieceSet("Metal"),
    PieceSet("RedVBlue", Featured.Yes),
    PieceSet("ModernJade"),
    PieceSet("ModernWood", Featured.Yes),
    PieceSet("Glass"),
    PieceSet("Trimmed", Featured.Yes),
    PieceSet("Experimental", Featured.Yes),
    PieceSet("CubesAndPi", Featured.Yes)
  )
