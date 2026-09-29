package ligo.gorules

import java.nio.charset.{ Charset, StandardCharsets }
import scala.collection.immutable.ListMap
import scala.collection.mutable

// Licence: MIT (LiGo's own code, ADR 0006).

/** One SGF node: its properties (upper-case names, unescaped values, in file order) and its variations. */
final case class SgfNode(props: ListMap[String, List[String]], children: List[SgfNode]):
  def one(id: String): Option[String] = props.get(id).flatMap(_.headOption)

/** Why an SGF record can't be read or imported. `move` is the move number when a move is the cause;
  * `importOnly` means the analysis board still opens the record (a 13×13 game, a resumed one, a long one).
  */
final case class SgfError(message: String, move: Option[Int] = None, importOnly: Boolean = false):
  def text: String = move.fold(message)(n => s"move $n: $message")

/** Reads SGF (FF[4]) text into [[SgfNode]]s: only the structure, no Go rules (ADR 0023 §3, memo
  * docs/build-vs-buy/server-sgf-reader.md). No maintained JVM reader fits, so this is LiGo's own. It reads by
  * the same grammar as `libs/board`'s reader (`recordOf` in `src/sgf.mjs`) and refuses what that one refuses:
  * more than [[SgfReader.maxBytes]] of text, [[SgfReader.maxNodes]] nodes or [[SgfReader.maxDepth]] nested
  * variations, a property name of anything but ASCII letters or with no capital, a property with no value.
  */
object SgfReader:

  /** 200 KB of UTF-8 text (ADR 0023 §2). */
  val maxBytes: Int = 200 * 1024

  /** The most nodes, moves and notes together; libs/board's `MAX_SGF_NODES`. */
  val maxNodes: Int = 10000

  /** The deepest nesting of variations; libs/board's `MAX_SGF_DEPTH`. */
  val maxDepth: Int = 1000

  private val recordStart = """\([ \t\n\r\f\x0B]*;""".r

  /** The first game of a collection, as its root node: from the first `(;` (text before it is skipped) to its
    * closing `)` (text after it is ignored), checked against the grammar libs/board's `recordOf` shares.
    */
  def parse(text: String): Either[SgfError, SgfNode] =
    if text.length > maxBytes || text.getBytes(StandardCharsets.UTF_8).length > maxBytes then
      Left(SgfError(s"the record is longer than ${maxBytes / 1024} KB"))
    else
      recordStart.findFirstMatchIn(text) match
        case None => Left(SgfError("not an SGF record"))
        case Some(m) => Parser(text, m.start).gameTree()

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

  // SGF's whitespace between tokens: ASCII only, as libs/board's `recordOf`.
  private def isSpace(c: Char) = c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\f' || c == '\u000b'
  private def isLetter(c: Char) = (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z')

  private final class Parser(s: String, start: Int):
    private var i = start

    private def fail(what: String): Left[SgfError, Nothing] =
      Left(SgfError(s"not a readable SGF record ($what at character ${i + 1})"))

    private def skipSpace(): Unit = while i < s.length && isSpace(s(i)) do i += 1

    // The game tree from the '(' at `i`. Each open variation keeps the node it branches from; a node's
    // first variation continues its sequence.
    def gameTree(): Either[SgfError, SgfNode] =
      var root: Option[Building] = None
      var current: Option[Building] = None
      var nodes = 0
      val branchPoints = mutable.Stack.empty[Option[Building]]
      // Per depth: a variation has closed there, so only more variations or the end may follow.
      val afterVariation = new Array[Boolean](maxDepth + 1)
      while true do
        skipSpace()
        if i >= s.length then return fail("the record ends before its variations close")
        s(i) match
          case '(' =>
            if branchPoints.size >= maxDepth then
              return Left(SgfError("the record's variations are nested too deeply"))
            i += 1
            branchPoints.push(current)
            afterVariation(branchPoints.size) = false
            skipSpace()
            if i >= s.length || (s(i) != ';' && s(i) != ')') then return fail("expected ';'")
          case ')' =>
            i += 1
            current = branchPoints.pop()
            if branchPoints.isEmpty then return root.map(_.result).toRight(SgfError("not an SGF record"))
            afterVariation(branchPoints.size) = true
          case ';' =>
            if afterVariation(branchPoints.size) then return fail("a node after a variation")
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
      while i < s.length && isLetter(s(i)) do
        val from = i
        while i < s.length && isLetter(s(i)) do i += 1
        val name = s.substring(from, i)
        // FF[3]'s long names (`AddBlack`) keep their capitals, as the SGF spec says.
        val id = name.filter(c => c >= 'A' && c <= 'Z')
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

    // A value from its '[': carriage returns are dropped, then `\` escapes the next character and `\`
    // before a line break removes both (a soft break), as @sabaki/sgf reads it.
    private def value(): Either[SgfError, String] =
      i += 1
      val from = i
      while i < s.length && s(i) != ']' do i += (if s(i) == '\\' then 2 else 1)
      if i >= s.length then fail("the record ends inside a value")
      else
        val raw = s.substring(from, i).replace("\r", "")
        i += 1
        val out = new StringBuilder
        var j = 0
        while j < raw.length do
          if raw(j) == '\\' && j + 1 < raw.length then
            if raw(j + 1) != '\n' then out += raw(j + 1)
            j += 2
          else
            out += raw(j)
            j += 1
        Right(out.result())
