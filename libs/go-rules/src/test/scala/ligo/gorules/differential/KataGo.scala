package ligo.gorules.differential

import java.io.{ BufferedReader, File, InputStreamReader, OutputStreamWriter }
import java.nio.charset.StandardCharsets.UTF_8

import ligo.gorules.*

// Licence: MIT (LiGo's own code, ADR 0006).

/** KataGo as the differential test's oracle, driven over GTP (one `katago gtp` process per worker).
  *
  * KataGo's `play` is tolerant: it accepts ko retakes and multi-stone suicide (logs/rules-engine.md, unit
  * 1.6), so it is not asked about legality. Legality comes from `kata-raw-nn`, whose policy marks every move
  * KataGo's strict check refuses (occupied, suicide, ko, situational superko) as NAN. The neural network's
  * judgement plays no part: only the NAN mask, the board and the final count are read, so KataGo's small test
  * network is enough.
  */
final class KataGo(command: Seq[String], stderrLog: File) extends Oracle with AutoCloseable:

  private val process = ProcessBuilder(command*)
    .redirectError(ProcessBuilder.Redirect.appendTo(stderrLog))
    .start()
  private val in = OutputStreamWriter(process.getOutputStream, UTF_8)
  private val out = BufferedReader(InputStreamReader(process.getInputStream, UTF_8))
  private var size: BoardSize = BoardSize.Nineteen

  /** One GTP command and its answer: `Right(body)` for `=`, `Left(message)` for `?`. */
  def send(command: String): Either[String, String] =
    in.write(command + "\n")
    in.flush()
    val first = Iterator
      .continually(out.readLine())
      .map(line => if line == null then throw KataGo.Died(command, stderrLog) else line)
      .dropWhile(_.isEmpty)
      .next()
    val rest = Iterator.continually(out.readLine()).takeWhile(line => line != null && line.nonEmpty).toList
    val body = (first.drop(1).trim :: rest).mkString("\n")
    if first.startsWith("=") then Right(body) else Left(body)

  private def ok(command: String): String =
    send(command).fold(e => throw KataGo.Refused(command, e), identity)

  def newGame(size: BoardSize, komi: Double, handicapStones: Set[Point]): Unit =
    this.size = size
    ok(s"boardsize ${size.lines}")
    ok("clear_board")
    ok(s"kata-set-rules ${KataGo.rules}")
    ok(s"komi $komi")
    if handicapStones.nonEmpty then
      ok(s"set_free_handicap ${handicapStones.toList.map(Gtp.vertex(_, size)).mkString(" ")}")

  def play(color: Color, at: Option[Point]): Unit =
    ok(s"play ${Gtp.color(color)} ${at.fold("pass")(Gtp.vertex(_, size))}")

  def undo(): Unit = ok("undo")

  def legalPoints: Set[Point] = Gtp.legalPoints(ok("kata-raw-nn 0"), size)

  def position: OraclePosition = Gtp.position(ok("showboard"), size)

  def finalScore: Double = Gtp.score(ok("final_score"))

  def close(): Unit =
    try send("quit")
    catch case _: Exception => ()
    process.destroy()

object KataGo:

  /** LiGo's legality rules in KataGo's terms (docs/rules/spec.md): situational superko (R-KO-1, ADR 0003)
    * with situations after passes counted (R-KO-2, as KataGo does), suicide illegal (R-MOVE-5). Area scoring
    * with no pass tricks makes `final_score` a plain count of the board with every stone alive, komi
    * included; no handicap bonus, so the count is comparable with strategygames' (Chinese compensation is
    * goscorer's job, R-SCORE-4).
    */
  val rules: String =
    """{"ko":"SITUATIONAL","scoring":"AREA","tax":"NONE","suicide":false,"hasButton":false,""" +
      """"whiteHandicapBonus":"0","friendlyPassOk":false}"""

  final case class Refused(command: String, message: String)
      extends RuntimeException(s"KataGo refused `$command`: $message")

  final case class Died(command: String, log: File)
      extends RuntimeException(s"KataGo stopped answering at `$command`; see $log")

/** Reading and writing GTP text, kept apart from the process so the tests can check it without KataGo. */
object Gtp:

  // GTP columns skip I; rows count from the bottom. Point counts rows from the top, like SGF.
  private val columns = "ABCDEFGHJKLMNOPQRST"

  def vertex(p: Point, size: BoardSize): String = s"${columns(p.col)}${size.lines - p.row}"

  def color(c: Color): String = if c == Color.Black then "b" else "w"

  /** `kata-raw-nn` output: the `policy` block is one line per row, top row first, with NAN where the move is
    * illegal.
    */
  def legalPoints(rawNn: String, size: BoardSize): Set[Point] =
    val rows = rawNn.linesIterator.dropWhile(_.trim != "policy").drop(1).take(size.lines).toList
    require(rows.size == size.lines, s"no ${size.lines}-row policy block in kata-raw-nn output:\n$rawNn")
    rows.zipWithIndex.flatMap { (line, row) =>
      val cells = line.trim.split("\\s+").toList
      require(cells.size == size.lines, s"policy row $row has ${cells.size} cells: $line")
      cells.zipWithIndex.collect { case (v, col) if v != "NAN" => Point(col, row) }
    }.toSet

  /** `showboard` output: a header of column letters, one line per row (top row first, each point one
    * character, X Black, O White, . empty, followed by a space or a recent-move marker), then the player to
    * move and the stones each colour has lost.
    */
  def position(showboard: String, size: BoardSize): OraclePosition =
    val lines = showboard.linesIterator.toList
    val header = lines.indexWhere(_.trim.startsWith("A B"))
    require(header >= 0, s"no board in showboard output:\n$showboard")
    val stones = lines
      .slice(header + 1, header + 1 + size.lines)
      .zipWithIndex
      .flatMap { (line, row) =>
        (0 until size.lines).flatMap { col =>
          line.lift(3 + 2 * col) match
            case Some('X') => Some(Point(col, row) -> Color.Black)
            case Some('O') => Some(Point(col, row) -> Color.White)
            case Some('.') => None
            case other => throw IllegalArgumentException(s"row $row col $col is $other in:\n$showboard")
        }
      }
      .toMap
    def field(name: String): String =
      lines
        .collectFirst { case l if l.startsWith(name) => l.drop(name.length).trim }
        .getOrElse(throw IllegalArgumentException(s"no `$name` in showboard output:\n$showboard"))
    val toMove = if field("Next player:") == "Black" then Color.Black else Color.White
    // "B stones captured" counts Black stones lost, that is, White's captures.
    val captures =
      Captures(black = field("W stones captured:").toInt, white = field("B stones captured:").toInt)
    OraclePosition(stones, toMove, captures)

  /** `final_score` output: `W+8.0`, `B+3.5` or `0`, as White minus Black. */
  def score(finalScore: String): Double = finalScore.trim match
    case "0" => 0.0
    case s if s.startsWith("W+") => s.drop(2).toDouble
    case s if s.startsWith("B+") => -s.drop(2).toDouble
    case s => throw IllegalArgumentException(s"unexpected final_score answer: $s")
