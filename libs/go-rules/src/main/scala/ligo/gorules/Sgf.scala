package ligo.gorules

// Licence: MIT (LiGo's own code, ADR 0006).

/** Writes a game as an SGF (FF[4]) record: the game settings, the starting stones and the moves.
  *
  * strategygames has its own writer, but it writes handicap stones as moves rather than setup stones and
  * works out each move's colour from its index, which is wrong for a custom starting position; so this one
  * writes `AB`/`AW` and an explicit colour per move. A resumption leaves no mark: play just goes on, and the
  * natural turn order (R-SP-6) keeps the colours alternating. [[SgfImport]] reads a record back (unit 7.3,
  * ADR 0023 §3); a resumed game's record doesn't import, since its moves follow two passes.
  */
object Sgf:

  def write(game: GoGame, info: SgfInfo = SgfInfo()): String =
    val setup = game.setup
    val (start, firstToMove) = startOf(game)
    val header = List(
      "GM[1]",
      "FF[4]",
      "CA[UTF-8]",
      s"SZ[${setup.size.lines}]",
      s"RU[${setup.ruleset}]",
      s"KM[${komi(setup.komi)}]"
    ) ++ Option.when(setup.handicap >= 2)(s"HA[${setup.handicap}]") ++
      infoProperties(info) ++
      stonesOf(start, Color.Black).map(ps => s"AB$ps") ++
      stonesOf(start, Color.White).map(ps => s"AW$ps") ++
      Option.when(start.nonEmpty || firstToMove == Color.White)(s"PL[${letter(firstToMove)}]")
    val moves = game.actions
      .foldLeft((firstToMove, Vector.empty[String])):
        case ((color, nodes), Action.Place(at)) => (color.opposite, nodes :+ s";${letter(color)}[${at.sgf}]")
        case ((color, nodes), Action.Pass) => (color.opposite, nodes :+ s";${letter(color)}[]")
        case ((color, nodes), Action.Resume) => (color, nodes)
      ._2
    s"(;${header.mkString}\n${moves.mkString("\n")})"

  // Game information (FF[4] "game-info" properties), in the order players read them.
  private def infoProperties(info: SgfInfo): List[String] =
    List(
      info.black.map(n => s"PB[${text(n)}]"),
      info.blackRank.map(r => s"BR[${text(r)}]"),
      info.white.map(n => s"PW[${text(n)}]"),
      info.whiteRank.map(r => s"WR[${text(r)}]"),
      info.date.map(d => s"DT[$d]"),
      info.place.map(p => s"PC[${text(p)}]")
    ).flatten ++ timeProperties(info.time) ++ info.result.map(r => s"RE[${r.sgf}]")

  private def timeProperties(time: Option[SgfTime]): List[String] = time match
    case Some(SgfTime.Byoyomi(c)) =>
      List(s"TM[${c.mainSeconds}]", s"OT[${c.periods}x${c.periodSeconds} byo-yomi]")
    case Some(SgfTime.Fischer(limit, increment)) => List(s"TM[$limit]", s"OT[$increment fischer]")
    case Some(SgfTime.Correspondence(days)) => List(s"OT[$days days per move]")
    case None => Nil

  // SimpleText: `]` and `\` are escaped with a backslash; line breaks become spaces.
  private def text(s: String): String =
    s.replace("\\", "\\\\").replace("]", "\\]").replaceAll("[\r\n]+", " ")

  private def startOf(game: GoGame): (Map[Point, Color], Color) =
    GoGame.start(game.setup) match
      case Right(fresh) => (fresh.stones, fresh.toMove)
      case Left(e) => sys.error(s"a started game has a valid setup: ${e.message}")

  private def stonesOf(stones: Map[Point, Color], color: Color): Option[String] =
    val points = stones.collect { case (p, c) if c == color => p.sgf }.toList.sorted
    Option.when(points.nonEmpty)(points.map(p => s"[$p]").mkString)

  private def letter(color: Color): String = if color == Color.Black then "B" else "W"

  // 6.5, 7, -3.5, 0.5
  private def komi(k: Double): String = BigDecimal(k).bigDecimal.stripTrailingZeros.toPlainString

/** How a game was timed, for SGF's `TM` (main time in seconds) and `OT` (overtime, free text). */
enum SgfTime:
  case Byoyomi(config: ByoyomiConfig)
  case Fischer(limitSeconds: Int, incrementSeconds: Int)
  case Correspondence(daysPerMove: Int)

/** Game information lila adds to an SGF record (unit 4.3, written by 4.11's export). Every field is optional;
  * the default writes a bare record, as before.
  */
final case class SgfInfo(
    black: Option[String] = None,
    white: Option[String] = None,
    blackRank: Option[String] = None,
    whiteRank: Option[String] = None,
    date: Option[java.time.LocalDate] = None,
    place: Option[String] = None,
    time: Option[SgfTime] = None,
    result: Option[GameResult] = None
)
