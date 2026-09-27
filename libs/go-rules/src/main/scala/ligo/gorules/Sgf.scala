package ligo.gorules

// Licence: MIT (LiGo's own code, ADR 0006).

/** Writes a game as an SGF (FF[4]) record: the game settings, the starting stones and the moves.
  *
  * strategygames has its own writer, but it writes handicap stones as moves rather than setup stones and
  * works out each move's colour from its index, which is wrong for a custom starting position; so this one
  * writes `AB`/`AW` and an explicit colour per move. A resumption leaves no mark: play just goes on, and the
  * natural turn order (R-SP-6) keeps the colours alternating. Reading SGF back is goban-engine's job (unit
  * 1.8); we don't write a parser (.claude/skills/sgf).
  */
object Sgf:

  def write(game: GoGame): String =
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
