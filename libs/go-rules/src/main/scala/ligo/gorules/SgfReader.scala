package ligo.gorules

import java.nio.charset.{ Charset, StandardCharsets }
import scala.collection.immutable.ListMap
import scala.collection.mutable

// Licence: MIT (LiGo's own code, ADR 0006).

/** One SGF node: its properties (upper-case names, unescaped values, in file order) and its variations. */
final case class SgfNode(props: ListMap[String, List[String]], children: List[SgfNode]):
  def one(id: String): Option[String] = props.get(id).flatMap(_.headOption)

/** Why an SGF record can't be read or imported. `move` is the move number when a move is the cause. */
final case class SgfError(message: String, move: Option[Int] = None):
  def text: String = move.fold(message)(n => s"move $n: $message")

/** Reads SGF (FF[4]) text into [[SgfNode]]s: only the structure, no Go rules (ADR 0023 §3, memo
  * docs/build-vs-buy/server-sgf-reader.md). No maintained JVM reader fits, so this is LiGo's own; it reads a
  * file the same way `libs/board`'s reader (@sabaki/sgf, unit 7.2) does, and refuses what that one refuses:
  * more than [[SgfReader.maxBytes]] of text or [[SgfReader.maxNodes]] nodes, a property name with no capital
  * letters. Lower-case letters inside a name (FF[3]'s `AddBlack`) are dropped, as the SGF spec says.
  */
object SgfReader:

  /** 200 KB of UTF-8 text (ADR 0023 §2). */
  val maxBytes: Int = 200 * 1024

  /** The most nodes, moves and notes together; libs/board's `MAX_SGF_NODES`. */
  val maxNodes: Int = 10000

  private val recordStart = """\(\s*;""".r

  /** The games of a collection, each a root node. */
  def parse(text: String): Either[SgfError, List[SgfNode]] =
    if text.length > maxBytes || text.getBytes(StandardCharsets.UTF_8).length > maxBytes then
      Left(SgfError(s"the record is longer than ${maxBytes / 1024} KB"))
    else if recordStart.findFirstIn(text).isEmpty then Left(SgfError("not an SGF record"))
    else Parser(text).collection()

  /** An SGF file's text: UTF-8 unless its `CA` names another charset the JVM knows; an unknown or invalid
    * name falls back to UTF-8 rather than failing. A byte-order mark is dropped.
    */
  def decode(bytes: Array[Byte]): String =
    val head = new String(bytes.take(4096), StandardCharsets.ISO_8859_1)
    // Bounded, so a head full of `CA[` can't make the search slow (libs/board's `decodeSgf` too).
    val named = """CA\s{0,8}\[([^\]]{0,40})\]""".r.findFirstMatchIn(head).map(_.group(1).trim)
    val charset = named
      .flatMap(n => scala.util.Try(Charset.forName(n)).toOption)
      .getOrElse(StandardCharsets.UTF_8)
    new String(bytes, charset).stripPrefix("﻿")

  // A node being built, with its parent: the tree is built without recursion, since a long main line is
  // thousands of nodes deep.
  private final class Building(val parent: Option[Building]):
    // A buffer per property: a file may repeat one property thousands of times (`AB[aa]AB[ab]…`).
    val props = mutable.LinkedHashMap.empty[String, mutable.ListBuffer[String]]
    val children = mutable.ListBuffer.empty[Building]
    def result: SgfNode =
      // Children first, deepest last: an explicit post-order walk.
      val done = mutable.HashMap.empty[Building, SgfNode]
      val stack = mutable.Stack[(Building, Boolean)]((this, false))
      while stack.nonEmpty do
        val (b, expanded) = stack.pop()
        if expanded then
          done(b) = SgfNode(ListMap.from(b.props.view.mapValues(_.toList)), b.children.toList.map(done))
        else
          stack.push((b, true))
          b.children.foreach(c => stack.push((c, false)))
      done(this)

  private final class Parser(s: String):
    private var i = 0
    private var nodes = 0

    private def fail(what: String): Left[SgfError, Nothing] =
      Left(SgfError(s"not a readable SGF record ($what at character ${i + 1})"))

    private def skipSpace(): Unit = while i < s.length && s(i).isWhitespace do i += 1

    def collection(): Either[SgfError, List[SgfNode]] =
      val games = mutable.ListBuffer.empty[SgfNode]
      var error: Option[SgfError] = None
      // Text around the games (a mail header, a note) is skipped, as SGF editors do.
      def skipToGame(): Unit = while i < s.length && s(i) != '(' do i += 1
      skipToGame()
      while error.isEmpty && i < s.length do
        gameTree().fold(e => error = Some(e), games += _)
        skipToGame()
      error
        .toLeft(games.toList)
        .flatMap(g => if g.isEmpty then Left(SgfError("not an SGF record")) else Right(g))

    // One game tree from the '(' at `i`. Each open variation keeps the node it branches from; a node's
    // first variation continues its sequence.
    private def gameTree(): Either[SgfError, SgfNode] =
      var root: Option[Building] = None
      var current: Option[Building] = None
      val branchPoints = mutable.Stack.empty[Option[Building]]
      while true do
        skipSpace()
        if i >= s.length then return fail("the record ends before its variations close")
        s(i) match
          case '(' =>
            i += 1
            branchPoints.push(current)
            skipSpace()
            if i < s.length && s(i) == ')' then () // an empty variation
            else if i >= s.length || s(i) != ';' then return fail("expected ';'")
          case ')' =>
            i += 1
            if branchPoints.isEmpty then return fail("unexpected ')'")
            current = branchPoints.pop()
            if branchPoints.isEmpty then return root.map(_.result).toRight(SgfError("not an SGF record"))
          case ';' =>
            i += 1
            nodes += 1
            if nodes > maxNodes then return Left(SgfError(s"the record has more than $maxNodes nodes"))
            val node = new Building(current)
            current match
              case Some(parent) => parent.children += node
              case None => root = Some(node)
            current = Some(node)
            properties(node) match
              case Left(e) => return Left(e)
              case Right(()) => ()
          case c => return fail(s"unexpected '$c'")
      fail("unreachable")

    private def properties(node: Building): Either[SgfError, Unit] =
      skipSpace()
      while i < s.length && s(i).isLetter do
        val start = i
        while i < s.length && s(i).isLetter do i += 1
        val name = s.substring(start, i)
        val id = name.filter(_.isUpper)
        if id.isEmpty then
          return Left(SgfError(s"property $name has no capital letters: not an SGF property name"))
        skipSpace()
        if i >= s.length || s(i) != '[' then return fail(s"property $name has no value")
        val values = node.props.getOrElseUpdate(id, mutable.ListBuffer.empty)
        while i < s.length && s(i) == '[' do
          value() match
            case Left(e) => return Left(e)
            case Right(v) => values += v
          skipSpace()
      Right(())

    // A value from its '[': `\` escapes the next character; `\` before a line break removes both (a soft
    // break); carriage returns are dropped.
    private def value(): Either[SgfError, String] =
      i += 1
      val out = new StringBuilder
      while i < s.length && s(i) != ']' do
        s(i) match
          case '\\' if i + 1 < s.length =>
            val next = s(i + 1)
            if next == '\n' || next == '\r' then
              i += 2
              if next == '\r' && i < s.length && s(i) == '\n' then i += 1
            else
              out += next
              i += 2
          case '\r' => i += 1
          case c =>
            out += c
            i += 1
      if i >= s.length then fail("the record ends inside a value")
      else
        i += 1
        Right(out.result())
