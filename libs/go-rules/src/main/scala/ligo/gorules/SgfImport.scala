package ligo.gorules

import java.util.Locale
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
    val ruleName = one("RU").fold("")(v => jsTrim(v).toLowerCase(Locale.ROOT))
    val ruleset = if ruleName.isEmpty then Some(Ruleset.Japanese) else rulesets.get(ruleName)
    val handicapText = Some(one("HA").fold("")(jsTrim)).filter(_.nonEmpty).getOrElse("0")
    for
      _ <- one("GM").filter(_ != "1").map(gm => SgfError(s"GM[$gm] is not a game of Go")).toLeft(())
      size <- sizeOf(one("SZ"))
      komi <- komiOf(one("KM"), ruleset.getOrElse(Ruleset.Japanese))
      handicap <- Option
        .when(handicapText.forall(c => c >= '0' && c <= '9'))(handicapText.toIntOption)
        .flatten
        .filter(_ <= 9)
        .toRight(SgfError(s"handicap HA[$handicapText]: LiGo plays 0 to 9 stones"))
      black <- pointsOf(props.getOrElse("AB", Nil), size)
      white <- pointsOf(props.getOrElse("AW", Nil), size)
      _ <- Either.cond(!black.exists(white.contains), (), SgfError("a setup point holds both colours"))
      _ <- chainWithoutLiberty(black, white, size)
        .map(p => SgfError(s"the setup stone at ${p.sgf} has no liberties"))
        .toLeft(())
    yield
      val toMove = one("PL").map(v => jsTrim(v).toUpperCase(Locale.ROOT)) match
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

  // A setup stone whose chain has no liberties, if any: GoGame can't start from it (libs/board refuses it too).
  private def chainWithoutLiberty(black: List[Point], white: List[Point], size: BoardSize): Option[Point] =
    val colour = (black.map(_ -> Color.Black) ++ white.map(_ -> Color.White)).toMap
    val seen = mutable.HashSet.empty[Point]
    def neighbours(p: Point) =
      List(Point(p.col - 1, p.row), Point(p.col + 1, p.row), Point(p.col, p.row - 1), Point(p.col, p.row + 1))
        .filter(size.contains)
    (black ++ white).find: start =>
      !seen(start) && {
        var free = false
        val work = mutable.Stack(start)
        while work.nonEmpty do
          val p = work.pop()
          if seen.add(p) then
            neighbours(p).foreach: n =>
              colour.get(n) match
                case None => free = true
                case Some(c) => if c == colour(start) && !seen(n) then work.push(n)
        !free
      }

  /** JavaScript's `trim`: libs/board trims values that way, so this reader does too. */
  def jsTrim(s: String): String =
    def space(c: Char) =
      "\t\n\u000b\f\r\ufeff\u2028\u2029".contains(c) || Character.getType(c) == Character.SPACE_SEPARATOR
    s.dropWhile(space).reverse.dropWhile(space).reverse

  private val rulesets: Map[String, Ruleset] =
    List("japanese", "jp", "korean", "kr").map(_ -> Ruleset.Japanese).toMap ++
      List("chinese", "cn", "zh", "aga", "nz", "new zealand", "goe", "ing").map(_ -> Ruleset.Chinese)

  private val sizePattern = """(\d+)(?::(\d+))?""".r
  private val komiPattern = """[+-]?\d{1,4}(\.\d+)?""".r

  private def sizeOf(text: Option[String]): Either[SgfError, BoardSize] =
    val value = text.fold("19")(jsTrim)
    val lines = value match
      case sizePattern(n, m) if m == null || m == n => n.toIntOption
      case _ => None
    lines
      .flatMap(BoardSize(_))
      .toRight(SgfError(s"board size SZ[$value]: the analysis board has 9×9, 13×13 and 19×19"))

  private def komiOf(text: Option[String], ruleset: Ruleset): Either[SgfError, Double] =
    val value = text.fold("")(jsTrim)
    def refused(why: String) = Left(SgfError(s"komi KM[$value]$why"))
    // Doubles, as JavaScript's numbers in libs/board, so both round a long komi the same way.
    if value.isEmpty then Right(0)
    else if !komiPattern.matches(value) || value.toDouble.abs > 1000 then
      refused(" is not a number of points LiGo can use")
    else
      val written = value.toDouble
      // Files from Chinese servers give komi in stones: 3.75 means 7.5 (ADR 0023 §2).
      val fraction = written.abs % 1
      val komi =
        if ruleset == Ruleset.Chinese && written < 5 && (fraction == 0.25 || fraction == 0.75) then
          written * 2
        else written
      if (komi * 2) % 1 != 0 then refused(": LiGo's komi is a multiple of 0.5")
      else Right(komi)

  // SGF points, with `aa:cc` rectangles expanded, checked to be on the board; each point once, in file order.
  private def pointsOf(values: List[String], size: BoardSize): Either[SgfError, List[Point]] =
    val points = mutable.LinkedHashSet.empty[Point]
    def on(p: String) = Point.fromSgf(p).filter(size.contains)
    values
      .foldLeft[Either[SgfError, Unit]](Right(())): (done, value) =>
        done.flatMap: _ =>
          val parts = jsTrim(value).split(":", -1).toList
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
    * move is the cause).
    *
    * The whole tree is replayed first, the same way libs/board's `readTree` builds the analysis tree, so the
    * server stores only records the analysis board opens (ADR 0023 §2): every move in every variation legal
    * and by the colour to move, setup stones only at the root, a node without a move replaced by its
    * children, the same move twice from one position one node. Then the main line of that tree must also be
    * storable: 9×9 or 19×19 (R-SCOPE-1), at most `actionCap` actions, nothing after two passes in a row.
    */
  def apply(text: String, actionCap: Int = maxActions): Either[SgfError, SgfImport] =
    for
      root <- SgfReader.parse(text)
      _ <- setupAtRoot(root)
      settings <- SgfSettings.of(root.props, firstMoveOf(root))
      // Komi decides no move, and the analysis board takes any: the tree is replayed without it, so a komi
      // the stored game can't have (bigger than the board) is refused only after the moves were checked.
      replayed <- GoGame.start(setupOf(settings.copy(komi = 0))).left.map(e => SgfError(e.message))
      line <- mainLineOf(root, replayed)
      start <- GoGame.start(setupOf(settings)).left.map(e => SgfError(e.message, importOnly = true))
      _ <- Either.cond(
        settings.size != BoardSize.Thirteen,
        (),
        SgfError("13×13 games can be studied on the analysis board but not imported yet", importOnly = true)
      )
      game <- replay(start, line, actionCap)
    yield SgfImport(game, settings, infoOf(root))

  private def setupAtRoot(root: SgfNode): Either[SgfError, Unit] =
    if root.props.contains("B") || root.props.contains("W") then
      Left(SgfError("the first node plays a move: LiGo reads moves from the second node on"))
    else if root.props.contains("AE") then
      Left(SgfError("AE (erase) in the first node: nothing is on the board to erase"))
    else Right(())

  // The colour of the main line's first move: the first node with B or W, looking through nodes without one.
  private def firstMoveOf(root: SgfNode): Option[Color] =
    val work = mutable.Stack.from(root.children)
    var found: Option[Color] = None
    while found.isEmpty && work.nonEmpty do
      val n = work.pop()
      found = colorOf(n)
      if found.isEmpty then work.pushAll(n.children.reverse)
    found

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

  private final case class Move(node: SgfNode, color: Color, action: Action, from: String)

  // The nodes that play a move after `source` (libs/board's `movesAfter`): its children, with each node that
  // plays none replaced by its own children, in file order. Setup stones, both colours in one node and points
  // off the board are refused here, before any of these moves is played.
  private def movesAfter(source: SgfNode, number: Int, size: BoardSize): Either[SgfError, List[Move]] =
    val moves = mutable.ListBuffer.empty[Move]
    val work = mutable.Stack.from(source.children)
    var error: Option[SgfError] = None
    def refused(why: String) = error = Some(SgfError(why, Some(number)))
    while error.isEmpty && work.nonEmpty do
      val n = work.pop()
      if List("AB", "AW", "AE").exists(n.props.contains) then
        refused("setup stones after the first move aren't supported (only at the start)")
      else if n.props.contains("B") && n.props.contains("W") then refused("a node plays both colours")
      else
        colorOf(n) match
          case None => work.pushAll(n.children.reverse)
          case Some(color) =>
            val value = SgfSettings.jsTrim(n.one(if color == Color.Black then "B" else "W").getOrElse(""))
            val from = s"${if color == Color.Black then "B" else "W"}[$value]"
            // `tt` is the old pass on 19×19 (the `sgf` skill): accepted, never written.
            if value.isEmpty || (value == "tt" && size == BoardSize.Nineteen) then
              moves += Move(n, color, Action.Pass, from)
            else
              Point.fromSgf(value).filter(size.contains) match
                case Some(p) => moves += Move(n, color, Action.Place(p), from)
                case None => refused(s"$from is off the board")
    error.toLeft(moves.toList)

  // A node of the tree as the analysis board builds it: the move and the moves after it.
  private final class Built(val action: Option[Action]):
    val children = mutable.ListBuffer.empty[Built]

  // Replays every variation, depth first in file order as `readTree` does, and returns the main line of the
  // tree it builds. After two passes a variation goes on as the analysis board lets it: play is resumed.
  private def mainLineOf(root: SgfNode, start: GoGame): Either[SgfError, List[Action]] =
    val tree = new Built(None)
    val stack = mutable.Stack((root, tree, start, 0))
    var error: Option[SgfError] = None
    while error.isEmpty && stack.nonEmpty do
      val (source, node, game, ply) = stack.pop()
      val number = ply + 1
      movesAfter(source, number, start.size) match
        case Left(e) => error = Some(e)
        case Right(moves) =>
          val next = mutable.ListBuffer.empty[(SgfNode, Built, GoGame, Int)]
          val it = moves.iterator
          while error.isEmpty && it.hasNext do
            val m = it.next()
            if m.color != game.toMove then
              error = Some(
                SgfError(s"${m.from} is not a move by ${name(game.toMove)}, the player to move", Some(number))
              )
            else
              playOn(game, m.action) match
                case Left(e) => error = Some(SgfError(s"${m.from} ${e.message}", Some(number), e.importOnly))
                case Right(after) =>
                  val made = node.children
                    .find(_.action.contains(m.action))
                    .getOrElse:
                      val b = new Built(Some(m.action))
                      node.children += b
                      b
                  next += ((m.node, made, after, number))
          stack.pushAll(next.reverse)
    error.toLeft:
      List.unfold(tree)(_.children.headOption.map(b => (b.action.get, b)))

  // A move in the analysis tree: legal under LiGo's rules; after two passes, play resumes first.
  private def playOn(game: GoGame, action: Action): Either[SgfError, GoGame] =
    val inPlay =
      if game.phase == Phase.Scoring then
        game.resume.left.map: _ =>
          SgfError("comes after passes that end play twice: LiGo can't replay it", importOnly = true)
      else Right(game)
    inPlay.flatMap(g => g(action).left.map(r => SgfError(s"is not a legal move (${r.key})")))

  private def name(color: Color) = color.toString.toLowerCase

  // The main line as a stored game: nothing after two passes in a row, at most `actionCap` actions.
  private def replay(start: GoGame, line: List[Action], actionCap: Int): Either[SgfError, GoGame] =
    line.foldLeft[Either[SgfError, GoGame]](Right(start)): (acc, action) =>
      acc.flatMap: game =>
        val number = game.actions.size + 1
        def refused(why: String) = Left(SgfError(why, Some(number), importOnly = true))
        if game.phase == Phase.Scoring then
          refused("a move after two passes in a row: a resumed game can't be imported")
        else if number > actionCap then refused(s"the game is longer than $actionCap moves")
        else game(action).left.map(r => SgfError(s"not a legal move (${r.key})", Some(number)))

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
