package lila.game

import ligo.gorules.{
  Action,
  BoardSize,
  Color as GoColor,
  GoGame,
  Point,
  Position,
  ReplayError,
  Ruleset,
  Setup as GoSetup
}
import reactivemongo.api.bson.*

import lila.core.game.{ GoBridge, GoScoring }
import lila.db.BSON
import lila.db.dsl.{ *, given }

/** How a Go game is stored in `game5` (ADR 0019 §4): the neutral keys every game has, plus a small Go block.
  * The position, captures, ko point and phase are not stored; loading replays the actions.
  */
object GoStorage:

  object F:
    val size = "sz"
    val ruleset = "ru"
    val komi = "km" // komi × 2, an integer
    val handicap = "hc" // omitted when 0
    val position = "ip" // a custom starting position; omitted otherwise
    val actions = "ac"
    val scoring = "sc"

  /** A game has no more actions than this: each resume needs a placement since the previous one (R-SP-9), so
    * there are at most as many resumes as plies. It bounds the replay of a corrupt document.
    */
  val maxActions: Int = 2 * GoBridge.maxPlies + 1

  /** The actions, 2 bytes each, big-endian: a point is `row × size + col`, a pass `0xFFFF` and a resume
    * `0xFFFE` (ADR 0019 §4). A 300-move game takes 600 bytes.
    */
  object actions:

    private val pass = 0xffff
    private val resume = 0xfffe

    def write(actions: Seq[Action], size: BoardSize): Array[Byte] =
      val bytes = new Array[Byte](actions.size * 2)
      actions.iterator.zipWithIndex.foreach: (action, i) =>
        val code = action match
          case Action.Place(at) => at.row * size.lines + at.col
          case Action.Pass => pass
          case Action.Resume => resume
        bytes(2 * i) = (code >> 8).toByte
        bytes(2 * i + 1) = code.toByte
      bytes

    /** Never fails: a point off the board decodes to one the replay refuses, and a trailing odd byte is
      * dropped.
      */
    def read(bytes: Array[Byte], size: BoardSize): Vector[Action] =
      Vector.tabulate((bytes.length / 2).min(maxActions)): i =>
        ((bytes(2 * i) & 0xff) << 8) | (bytes(2 * i + 1) & 0xff) match
          case `pass` => Action.Pass
          case `resume` => Action.Resume
          case code => Action.Place(Point(code % size.lines, code / size.lines))

  /** Sets of points (dead stones, points to seal), 2 bytes each as in `ac`, in board order. */
  object points:
    def write(ps: Set[Point], size: BoardSize): Array[Byte] =
      actions.write(ps.toList.sortBy(p => (p.row, p.col)).map(Action.Place(_)), size)
    def read(bytes: Array[Byte], size: BoardSize): Set[Point] =
      actions.read(bytes, size).collect { case Action.Place(at) if size.contains(at) => at }.toSet

  /** The scoring phase (ADR 0020 §2, unit 4.8), the `sc` subdocument. Each side's count is an array of
    * integers: Black's territory, stones, prisoners and total × 2; White's territory, stones, prisoners, komi
    * × 2, compensation and total × 2. `tx` marks a phase whose timeout passed while a recount was pending.
    */
  object scoring:

    private def sideWrite(s: GoScoring.Side, white: Boolean): List[Int] =
      val base = List(s.territory, s.stones, s.prisoners)
      val extra = if white then List((s.komi * 2).toInt, s.compensation) else Nil
      base ++ extra :+ (s.total * 2).toInt

    private def sideRead(a: List[Int], white: Boolean): Option[GoScoring.Side] =
      (white, a) match
        case (false, List(t, s, p, total)) => Some(GoScoring.Side(t, s, p, 0, 0, BigDecimal(total) / 2))
        case (true, List(t, s, p, komi, comp, total)) =>
          Some(GoScoring.Side(t, s, p, BigDecimal(komi) / 2, comp, BigDecimal(total) / 2))
        case _ => None

    private def acceptedKey(a: Set[GoColor]): Int =
      (if a(GoColor.Black) then 1 else 0) + (if a(GoColor.White) then 2 else 0)

    def write(sc: GoScoring, size: BoardSize): Bdoc =
      bdoc(
        "op" -> sc.opened,
        "q" -> sc.request,
        "cv" -> sc.shown,
        "pd" -> sc.proposal.map(p => points.write(p.dead, size)),
        "src" -> sc.proposal.map(_.source.key),
        "d" -> points.write(sc.dead, size),
        "sl" -> points.write(sc.seal, size),
        "ow" -> sc.owner,
        "sb" -> sc.count.map(c => sideWrite(c.black, white = false)),
        "sw" -> sc.count.map(c => sideWrite(c.white, white = true)),
        "acc" -> acceptedKey(sc.accepted),
        "ex" -> sc.expiresAt,
        "pn" -> sc.pending.option(true),
        "tx" -> sc.overtime.option(true)
      )

    def read(doc: Bdoc, size: BoardSize): Either[String, GoScoring] =
      val r = BSON.Reader(doc)
      def pts(k: String) = r.bytesO(k).fold(Set.empty[Point])(b => points.read(b.value, size))
      for
        opened <- r.dateO("op").toRight("no op")
        request <- r.intO("q").toRight("no q")
        shown <- r.intO("cv").toRight("no cv")
        expiresAt <- r.dateO("ex").toRight("no ex")
        proposal <- r.bytesO("pd") match
          case None => Right(None)
          case Some(b) =>
            GoScoring.Source.values
              .find(s => r.strO("src").has(s.key))
              .toRight(s"bad src ${r.strO("src")}")
              .map(src => Some(GoScoring.Proposal(points.read(b.value, size), src)))
        count <- (r.getO[List[Int]]("sb"), r.getO[List[Int]]("sw")) match
          case (None, None) => Right(None)
          case (Some(b), Some(w)) =>
            sideRead(b, white = false)
              .zip(sideRead(w, white = true))
              .map(GoScoring.Count.apply)
              .toRight(s"bad count $b $w")
              .map(Some(_))
          case _ => Left("half a count")
      yield
        val acc = r.intD("acc")
        GoScoring(
          opened,
          request,
          shown,
          proposal,
          pts("d"),
          pts("sl"),
          r.strD("ow"),
          count,
          Set(GoColor.Black).filter(_ => (acc & 1) != 0) ++ Set(GoColor.White).filter(_ => (acc & 2) != 0),
          expiresAt,
          overtime = r.boolD("tx")
        )

  private def rulesetKey(r: Ruleset) = r match
    case Ruleset.Japanese => "j"
    case Ruleset.Chinese => "c"

  private def colorKey(c: GoColor) = c match
    case GoColor.Black => "b"
    case GoColor.White => "w"

  /** `ip`: the stones as two strings of SGF points, like SGF's `AB` and `AW`, and the player to move:
    * `{ b: "ddpp", w: "pd", m: "w" }`.
    */
  private def writePosition(p: Position): Bdoc =
    def points(c: GoColor) = p.stones.collect { case (at, `c`) => at.sgf }.toList.sorted.mkString
    bdoc("b" -> points(GoColor.Black), "w" -> points(GoColor.White), "m" -> colorKey(p.toMove))

  private def readPosition(doc: Bdoc): Option[Position] =
    def points(k: String): Option[List[Point]] =
      doc.string(k).getOrElse("").grouped(2).toList.traverse(Point.fromSgf)
    for
      black <- points("b")
      white <- points("w")
      toMove <- doc.string("m").collect { case "b" => GoColor.Black; case "w" => GoColor.White }
    yield Position(black.map(_ -> GoColor.Black).toMap ++ white.map(_ -> GoColor.White), toMove)

  def write(g: GoGame): Bdoc =
    val s = g.setup
    bdoc(
      F.size -> s.size.lines,
      F.ruleset -> rulesetKey(s.ruleset),
      F.komi -> (s.komi * 2).toInt,
      F.handicap -> Option.when(s.handicap != 0)(s.handicap),
      F.position -> s.position.map(writePosition),
      F.actions -> actions.write(g.actions, s.size)
    )

  def isGo(r: BSON.Reader): Boolean = r.contains(F.size)

  /** The setup stored in a Go document, or why it can't be read. */
  def readSetup(r: BSON.Reader): Either[String, GoSetup] =
    for
      size <- r.intO(F.size).flatMap(BoardSize(_)).toRight(s"bad board size ${r.intO(F.size)}")
      ruleset <- r
        .strO(F.ruleset)
        .collect { case "j" => Ruleset.Japanese; case "c" => Ruleset.Chinese }
        .toRight(s"bad ruleset ${r.strO(F.ruleset)}")
      komi <- r.intO(F.komi).map(_ / 2.0).toRight("no komi")
      position <- r.getO[Bdoc](F.position) match
        case None => Right(None)
        case Some(doc) => readPosition(doc).map(Some(_)).toRight(s"bad starting position $doc")
    yield GoSetup(size, ruleset, komi, r.intD(F.handicap), position)

  /** The Go game a document holds. The stored actions of a corrupt document are replayed up to the first one
    * the rules refuse, which is logged; a game that reached the ply cap has its play closed again (ADR 0020
    * §3). Only a setup that can't be read or started is an error.
    */
  def read(r: BSON.Reader, id: GameId): Either[String, GoGame] =
    for
      setup <- readSetup(r)
      bytes = r.bytesD(F.actions).value
      _ =
        if bytes.length > 2 * maxActions then
          logger.error(s"Go game $id: ${bytes.length / 2} actions stored; loaded the first $maxActions")
      acts = actions.read(bytes, setup.size)
      replayed <- GoGame.replay(setup, acts) match
        case Right(g) => Right(g)
        case Left(e @ ReplayError.Refused(_, _, _, before)) =>
          logger.error(s"Go game $id: ${e.message}; loaded the game before it")
          Right(before)
        case Left(e: ReplayError.BadSetup) => Left(e.message)
    yield if GoBridge.plies(replayed) >= GoBridge.maxPlies then replayed.closePlay else replayed
