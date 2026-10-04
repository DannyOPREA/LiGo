package lila.puzzle

import play.api.libs.json.*
import reactivemongo.api.bson.*

/** Real puzzles of tools/puzzles/data (resources/generatedPuzzles.json), and what
  * `tools/puzzles/mongo/doc.js` makes of one: the document `dev/ligo puzzles load` writes.
  */
object PuzzleFixtures:

  lazy val generated: List[JsObject] =
    val stream = getClass.getResourceAsStream("/generatedPuzzles.json")
    try Json.parse(stream).as[List[JsObject]]
    finally stream.close()

  /** JSON to BSON the way mongosh writes it: whole numbers become ints. */
  def bson(js: JsValue): BSONValue = js match
    case JsNumber(n) if n.isValidInt => BSONInteger(n.toInt)
    case JsNumber(n) => BSONDouble(n.toDouble)
    case JsString(s) => BSONString(s)
    case JsBoolean(b) => BSONBoolean(b)
    case JsArray(values) => BSONArray(values.map(bson))
    case obj: JsObject => bdoc(obj)
    case _ => BSONNull

  def bdoc(obj: JsObject): BSONDocument = BSONDocument(obj.fields.map((k, v) => k -> bson(v)))

  /** doc.js: `set` plus `setOnInsert`, as one document with the `_id`. */
  def mongoDoc(p: JsObject): BSONDocument =
    def field(name: String) = (p \ name).as[JsValue]
    val set = BSONDocument(
      "size" -> bson(field("width")),
      "setup" -> bson(field("initial_state")),
      "player" -> bson(field("initial_player")),
      "tree" -> bson(field("move_tree")),
      "goal" -> bson(field("goal")),
      "prov" -> bson(field("provenance"))
    ) ++ (p \ "bounds").asOpt[JsValue].fold(BSONDocument.empty)(b => BSONDocument("bounds" -> bson(b)))
    val onInsert = BSONDocument(
      "glicko" -> BSONDocument(
        "r" -> BSONDouble((p \ "rating").as[Double]),
        "d" -> BSONDouble(500),
        "v" -> BSONDouble(0.09)
      ),
      "plays" -> BSONInteger(0),
      "vote" -> BSONDouble(0),
      "vu" -> BSONInteger(0),
      "vd" -> BSONInteger(0),
      "themes" -> bson(field("themes"))
    )
    BSONDocument("_id" -> (p \ "id").as[String]) ++ set ++ onInsert

  def without(doc: BSONDocument, keys: String*): BSONDocument = BSONDocument(doc.toMap -- keys)

  /** `doc` with the fields of `extra` set, replacing the ones with the same name. */
  def updated(doc: BSONDocument, extra: BSONDocument): BSONDocument = BSONDocument(doc.toMap ++ extra.toMap)
