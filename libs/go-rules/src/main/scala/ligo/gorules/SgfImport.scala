package ligo.gorules

import scala.collection.mutable

// Licence: MIT (LiGo's own code, ADR 0006).

/** A game's settings, from its SGF root: the table `libs/conformance/sgf/root.json`, which libs/board's
  * reader (`rootSettings` in `src/sgf.mjs`) replays too, so both read a root the same way (ADR 0023 §2).
  *
  * @param black
  *   setup stones, in the file's order
  * @param rulesetUnknown
  *   `RU` named a ruleset LiGo doesn't know, so Japanese was assumed (noted in the game's import info)
  */
final case class SgfSettings(
    size: BoardSize,
    ruleset: Ruleset,
    komi: Double,
    handicap: Int,
    black: List[Point],
    white: List[Point],
    toMove: Color,
    rulesetUnknown: Boolean = false
)

object SgfSettings:

  /** The settings a root's properties give, or why they can't be used.
    *
    * @param firstMove
    *   the colour of the main line's first move, if any: it says who plays first when `PL` doesn't
    */
  def of(props: Map[String, List[String]], firstMove: Option[Color]): Either[SgfError, SgfSettings] =
    def one(id: String) = props.get(id).flatMap(_.headOption)
    val ruleName = one("RU").fold("")(_.trim.toLowerCase)
    val ruleset = if ruleName.isEmpty then Some(Ruleset.Japanese) else rulesets.get(ruleName)
    val handicapText = Some(one("HA").fold("")(_.trim)).filter(_.nonEmpty).getOrElse("0")
    for
      _ <- one("GM").filter(_ != "1").map(gm => SgfError(s"GM[$gm] is not a game of Go")).toLeft(())
      size <- sizeOf(one("SZ"))
      komi <- komiOf(one("KM"), ruleset.getOrElse(Ruleset.Japanese))
      handicap <- Option
        .when(handicapText.forall(_.isDigit))(handicapText.toIntOption)
        .flatten
        .filter(_ <= 9)
        .toRight(SgfError(s"handicap HA[$handicapText]: LiGo plays 0 to 9 stones"))
      black <- pointsOf(props.getOrElse("AB", Nil), size)
      white <- pointsOf(props.getOrElse("AW", Nil), size)
      _ <- Either.cond(!black.exists(white.contains), (), SgfError("a setup point holds both colours"))
    yield
      val toMove = one("PL").map(_.trim.toUpperCase) match
        case Some("B") => Color.Black
        case Some("W") => Color.White
        case _ => firstMove.getOrElse(if handicap >= 2 then Color.White else Color.Black)
      SgfSettings(
        size,
        ruleset.getOrElse(Ruleset.Japanese),
        komi,
        handicap,
        black,
        white,
        toMove,
        rulesetUnknown = ruleset.isEmpty
      )

  private val rulesets: Map[String, Ruleset] =
    List("japanese", "jp", "korean", "kr").map(_ -> Ruleset.Japanese).toMap ++
      List("chinese", "cn", "zh", "aga", "nz", "new zealand", "goe", "ing").map(_ -> Ruleset.Chinese)

  private val sizePattern = """(\d+)(?::(\d+))?""".r
  private val komiPattern = """[+-]?\d{1,4}(\.\d+)?""".r

  private def sizeOf(text: Option[String]): Either[SgfError, BoardSize] =
    val value = text.fold("19")(_.trim)
    val lines = value match
      case sizePattern(n, m) if m == null || m == n => n.toIntOption
      case _ => None
    lines
      .flatMap(BoardSize(_))
      .toRight(SgfError(s"board size SZ[$value]: the analysis board has 9×9, 13×13 and 19×19"))

  private def komiOf(text: Option[String], ruleset: Ruleset): Either[SgfError, Double] =
    val value = text.fold("")(_.trim)
    def refused(why: String) = Left(SgfError(s"komi KM[$value]$why"))
    if value.isEmpty then Right(0)
    else if !komiPattern.matches(value) || BigDecimal(value).abs > 1000 then
      refused(" is not a number of points LiGo can use")
    else
      val written = BigDecimal(value)
      // Files from Chinese servers give komi in stones: 3.75 means 7.5 (ADR 0023 §2).
      val fraction = written.abs % 1
      val komi =
        if ruleset == Ruleset.Chinese && written < 5 && (fraction == 0.25 || fraction == 0.75) then
          written * 2
        else written
      if (komi * 2) % 1 != 0 then refused(": LiGo's komi is a multiple of 0.5")
      else Right(komi.toDouble)

  // SGF points, with `aa:cc` rectangles expanded, checked to be on the board; each point once, in file order.
  private def pointsOf(values: List[String], size: BoardSize): Either[SgfError, List[Point]] =
    val points = mutable.LinkedHashSet.empty[Point]
    def on(p: String) = Point.fromSgf(p).filter(size.contains)
    values
      .foldLeft[Either[SgfError, Unit]](Right(())): (done, value) =>
        done.flatMap: _ =>
          val parts = value.trim.split(":", -1).toList
          val corners = parts match
            case List(from) => on(from).map(p => (p, p))
            case List(from, to) => on(from).zip(on(to))
            case _ => None
          corners
            .map: (a, b) =>
              for
                col <- a.col.min(b.col) to a.col.max(b.col)
                row <- a.row.min(b.row) to a.row.max(b.row)
              do points += Point(col, row)
            .toRight(SgfError(s"setup point [$value] is off the board"))
      .map(_ => points.toList)

/** An SGF result (`RE`), as the file states it: kept as the imported game's result, never checked. */
enum SgfResult:
  /** `B+3.5`: the winner and the margin in points. */
  case Points(winner: Color, margin: BigDecimal)
  case Resigned(winner: Color)
  case OutOfTime(winner: Color)
  case Forfeit(winner: Color)

  /** `B+` with no reason. */
  case Won(winner: Color)
  case Jigo
  case Void
  case Unknown

object SgfResult:
  private val win = """([BW])\+(.*)""".r
  private val margin = """\d+(\.\d+)?""".r

  def apply(re: String): SgfResult = re.trim.toUpperCase match
    case "0" | "DRAW" | "JIGO" => Jigo
    case "VOID" => Void
    case win(c, how) =>
      val winner = if c == "B" then Color.Black else Color.White
      how.trim match
        case "" => Won(winner)
        case "R" | "RESIGN" => Resigned(winner)
        case "T" | "TIME" => OutOfTime(winner)
        case "F" | "FORFEIT" => Forfeit(winner)
        case m @ margin(_) => Points(winner, BigDecimal(m))
        case _ => Unknown
    case _ => Unknown

/** Game information from the root, as text (ADR 0023 §2): players are imported names and ranks are never read
  * as ratings.
  */
final case class SgfGameInfo(
    black: Option[String] = None,
    white: Option[String] = None,
    blackRank: Option[String] = None,
    whiteRank: Option[String] = None,
    date: Option[String] = None,
    place: Option[String] = None,
    event: Option[String] = None,
    result: Option[SgfResult] = None
)

/** A stored import (ADR 0023 §2, unit 7.5): the main line replayed through [[GoGame]], the settings it was
  * read with and the game information. Variations and comments stay in the SGF text, which the analysis board
  * reads.
  */
final case class SgfImport(game: GoGame, settings: SgfSettings, info: SgfGameInfo)

object SgfImport:

  /** ADR 0020's ply cap: the most actions, passes included, a stored game may have. */
  val maxActions: Int = 1000

  /** The first game of an SGF record as a stored game, or why it can't be stored (with the move number when a
    * move is the cause). Only 9×9 and 19×19 (R-SCOPE-1); every main-line move legal and by the colour to
    * move; setup stones only at the root; nothing after two passes in a row; at most `actionCap` actions.
    */
  def apply(text: String, actionCap: Int = maxActions): Either[SgfError, SgfImport] =
    for
      games <- SgfReader.parse(text)
      root = games.head
      _ <- setupAtRoot(root)
      line = mainLine(root)
      settings <- SgfSettings.of(root.props, line.collectFirst(Function.unlift(colorOf)))
      _ <- Either.cond(
        settings.size != BoardSize.Thirteen,
        (),
        SgfError("13×13 games can be studied on the analysis board but not imported yet")
      )
      start <- GoGame.start(setupOf(settings)).left.map(e => SgfError(e.message))
      game <- replay(start, line, actionCap)
    yield SgfImport(game, settings, infoOf(root))

  private def setupAtRoot(root: SgfNode): Either[SgfError, Unit] =
    if root.props.contains("B") || root.props.contains("W") then
      Left(SgfError("the first node plays a move: LiGo reads moves from the second node on"))
    else if root.props.contains("AE") then
      Left(SgfError("AE (erase) in the first node: nothing is on the board to erase"))
    else Right(())

  // The nodes after the root, first variation each time.
  private def mainLine(root: SgfNode): List[SgfNode] =
    List.unfold(root)(_.children.headOption.map(n => (n, n)))

  private def colorOf(node: SgfNode): Option[Color] =
    if node.props.contains("B") then Some(Color.Black)
    else if node.props.contains("W") then Some(Color.White)
    else None

  // `HA` with `AB` on the size's fixed points, White to move, is a handicap game; any other root stones, or
  // White moving first, are a custom start (ADR 0023 §2). Handicap stones a file plays as Black moves stay
  // moves.
  private def setupOf(s: SgfSettings): Setup =
    val stones = s.black.map(_ -> Color.Black) ++ s.white.map(_ -> Color.White)
    val handicapGame = Option
      .when(s.handicap >= 2 && s.white.isEmpty && s.toMove == Color.White):
        Setup(s.size, s.ruleset, s.komi, s.handicap)
      .filter(setup => GoGame.start(setup).exists(_.stones == stones.toMap))
    handicapGame.getOrElse:
      Setup(
        s.size,
        s.ruleset,
        s.komi,
        handicap = if s.handicap == 1 then 1 else 0,
        position = Option.when(stones.nonEmpty || s.toMove == Color.White)(Position(stones.toMap, s.toMove))
      )

  private def replay(start: GoGame, line: List[SgfNode], actionCap: Int): Either[SgfError, GoGame] =
    line.foldLeft[Either[SgfError, GoGame]](Right(start)): (acc, node) =>
      acc.flatMap: game =>
        val number = game.actions.size + 1
        def refused(why: String) = Left(SgfError(why, Some(number)))
        colorOf(node) match
          case _ if List("AB", "AW", "AE").exists(node.props.contains) =>
            refused("setup stones after the first move aren't supported (only at the start)")
          case _ if node.props.contains("B") && node.props.contains("W") =>
            refused("a node plays both colours")
          case None => Right(game) // comments or marks only
          case Some(color) =>
            val value = node.one(if color == Color.Black then "B" else "W").fold("")(_.trim)
            val from = s"${if color == Color.Black then "B" else "W"}[$value]"
            if game.phase == Phase.Scoring then
              refused(s"$from comes after two passes in a row: a resumed game can't be imported")
            else if number > actionCap then refused(s"the game is longer than $actionCap moves")
            else if color != game.toMove then
              refused(s"$from is not a move by ${game.toMove.toString.toLowerCase}, the player to move")
            else if value.isEmpty || (value == "tt" && game.size == BoardSize.Nineteen) then
              game.pass.left.map(r => SgfError(s"$from is not a legal move (${r.key})", Some(number)))
            else
              Point.fromSgf(value).filter(game.size.contains) match
                case None => refused(s"$from is off the board")
                case Some(p) =>
                  game.play(p).left.map(r => SgfError(s"$from is not a legal move (${r.key})", Some(number)))

  private def infoOf(root: SgfNode): SgfGameInfo =
    def text(id: String) = root.one(id).map(_.trim).filter(_.nonEmpty)
    SgfGameInfo(
      black = text("PB"),
      white = text("PW"),
      blackRank = text("BR"),
      whiteRank = text("WR"),
      date = text("DT"),
      place = text("PC"),
      event = text("EV"),
      result = text("RE").map(SgfResult(_))
    )
