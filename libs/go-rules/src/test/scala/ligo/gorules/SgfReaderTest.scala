package ligo.gorules

import play.api.libs.json.*

import java.nio.charset.StandardCharsets
import java.nio.file.{ Files, Paths }
import scala.util.Random

// The server's SGF reader and import (unit 7.3, ADR 0023 §2, §3): the root table and the records that
// libs/board's reader replays too, the `sgf` skill's quirks, limits, malformed input and the round trip
// with Sgf.write.
// Licence: MIT (LiGo's own code, ADR 0006).
class SgfReaderTest extends munit.FunSuite:

  private val sgfDir = Paths.get("..", "conformance", "sgf").toAbsolutePath.normalize
  private def cases(file: String) =
    (Json.parse(Files.readString(sgfDir.resolve(file))) \ "cases").as[List[JsObject]]

  private def points(json: JsLookupResult) = json.as[List[String]].map(p => Point.fromSgf(p).get)

  private def imported(text: String): SgfImport = SgfImport(text).fold(e => fail(e.text), identity)

  private def refusal(text: String): SgfError =
    SgfImport(text).fold(identity, i => fail(s"imported: ${i.game}"))

  // The root table: `refused` everywhere; `importRefused` is checked by the import below.
  for c <- cases("root.json") do
    val id = (c \ "id").as[String]
    test(s"root table: $id"):
      val props = (c \ "root")
        .as[JsObject]
        .value
        .toMap
        .map:
          case (k, JsArray(vs)) => k -> vs.map(_.as[String]).toList
          case (k, v) => k -> List(v.as[String])
      val firstMove = (c \ "firstMove").asOpt[String].map(Fixtures.color)
      val read = SgfSettings.of(props, firstMove)
      (c \ "expect").asOpt[JsObject] match
        case None => assert(read.isLeft, s"$id: read as $read")
        case Some(e) =>
          val s = read.fold(err => fail(s"$id: ${err.text}"), identity)
          assertEquals(s.size.lines, (e \ "size").as[Int])
          assertEquals(s.ruleset.toString.toLowerCase, (e \ "ruleset").as[String])
          assertEquals(s.komi, (e \ "komi").as[Double])
          assertEquals(s.handicap, (e \ "handicap").as[Int])
          assertEquals(s.black, points(e \ "black"))
          assertEquals(s.white, points(e \ "white"))
          assertEquals(s.toMove, Fixtures.color((e \ "toMove").as[String]))
          assertEquals(s.rulesetUnknown, (e \ "rulesetUnknown").asOpt[Boolean].getOrElse(false))

  test("root table: a 13×13 record opens on the analysis board but isn't imported"):
    val e = refusal("(;SZ[13]KM[6.5];B[gg])")
    assert(e.message.contains("13×13"), e.text)

  // Records libs/board's reader replays too (libs/board/test/sgf.test.mjs).
  for c <- cases("records.json") do
    val id = (c \ "id").as[String]
    test(s"records: $id"):
      val text = (c \ "sgf").as[String]
      val refused = (c \ "refused").asOpt[JsObject].orElse((c \ "importRefused").asOpt[JsObject])
      refused match
        case Some(r) => assertEquals(refusal(text).move, (r \ "move").asOpt[Int], id)
        case None =>
          val game = imported(text).game
          val moves = game.actions.collect:
            case Action.Place(p) => p.sgf
            case Action.Pass => ".."
          assertEquals(moves.toList, (c \ "expect" \ "moves").as[List[String]], id)
          assertEquals(game.toMove, Fixtures.color((c \ "expect" \ "toMove").as[String]), id)

  test("handicap stones on the fixed points make a handicap game; other stones a custom start"):
    val handicap = imported("(;SZ[19]HA[2]KM[0.5]RU[Chinese]AB[dp][pd];W[dd])")
    assertEquals(handicap.game.setup, Setup(BoardSize.Nineteen, Ruleset.Chinese, 0.5, handicap = 2))
    val custom = imported("(;SZ[19]HA[2]KM[0.5]AB[dd][pp];W[dp])")
    assertEquals(custom.game.setup.handicap, 0)
    assertEquals(
      custom.game.setup.position.map(_.stones),
      Some(Map(Point(3, 3) -> Color.Black, Point(15, 15) -> Color.Black))
    )
    // Handicap stones played as Black moves stay moves: Black plays first.
    val asMoves = imported("(;SZ[9]HA[2];B[cc];W[gg])")
    assertEquals(asMoves.game.setup, Setup(BoardSize.Nine, Ruleset.Japanese, 0))
    assertEquals(asMoves.settings.handicap, 2)

  test("reads game information as text, and the result as written"):
    val i = imported(
      "(;SZ[9]PB[Honinbo Shusaku]BR[4d]PW[Gennan \\] Inseki]WR[8d]DT[1846-09-11]PC[Osaka]EV[Ear-reddening game]RE[B+2];B[ee])"
    ).info
    assertEquals(
      i,
      SgfGameInfo(
        black = Some("Honinbo Shusaku"),
        white = Some("Gennan ] Inseki"),
        blackRank = Some("4d"),
        whiteRank = Some("8d"),
        date = Some("1846-09-11"),
        place = Some("Osaka"),
        event = Some("Ear-reddening game"),
        result = Some(SgfResult.Points(Color.Black, 2))
      )
    )

  test("SGF results: points, resignation, time, forfeit, jigo, void and anything else"):
    assertEquals(SgfResult("W+3.5"), SgfResult.Points(Color.White, BigDecimal("3.5")))
    assertEquals(SgfResult("B+R"), SgfResult.Resigned(Color.Black))
    assertEquals(SgfResult("w+resign"), SgfResult.Resigned(Color.White))
    assertEquals(SgfResult("B+T"), SgfResult.OutOfTime(Color.Black))
    assertEquals(SgfResult("W+F"), SgfResult.Forfeit(Color.White))
    assertEquals(SgfResult("B+"), SgfResult.Won(Color.Black))
    assertEquals(SgfResult("0"), SgfResult.Jigo)
    assertEquals(SgfResult("Draw"), SgfResult.Jigo)
    assertEquals(SgfResult("Void"), SgfResult.Void)
    assertEquals(SgfResult("?"), SgfResult.Unknown)
    assertEquals(SgfResult("B+lots"), SgfResult.Unknown)

  test("the parser keeps variations, repeated properties and values in order"):
    val root =
      SgfReader.parse("(;SZ[9]AB[aa]AB[bb][cc];B[ee](;W[dd])(;W[cc]C[x]))").fold(e => fail(e.text), _.head)
    assertEquals(root.props("AB"), List("aa", "bb", "cc"))
    val b = root.children.head
    assertEquals(b.children.map(_.one("W")), List(Some("dd"), Some("cc")))
    assertEquals(b.children(1).one("C"), Some("x"))

  test("values: escapes, soft line breaks and carriage returns"):
    val root =
      SgfReader.parse("(;C[a\\]b\\\\c\\:d]GC[one\\\r\ntwo\r\nthree])").fold(e => fail(e.text), _.head)
    assertEquals(root.one("C"), Some("a]b\\c:d"))
    assertEquals(root.one("GC"), Some("onetwo\nthree"))

  test("limits: 200 KB of UTF-8 text and 10,000 nodes"):
    val long = "(;SZ[9]C[" + "é" * (SgfReader.maxBytes / 2) + "])"
    assert(long.length < SgfReader.maxBytes)
    assert(SgfReader.parse(long).left.exists(_.message.contains("200 KB")))
    val many = "(;SZ[9]" + ";C[x]" * SgfReader.maxNodes + ")"
    assert(SgfReader.parse(many).left.exists(_.message.contains("10000 nodes")))
    val longGame = "(;SZ[19]" + (";B[];W[]" * 501) + ")"
    assertEquals(refusal(longGame).move, Some(3)) // two passes end it long before 1,000
    // The cap counts actions, passes included; lila's is 1,000 (ADR 0020).
    assertEquals(SgfImport.maxActions, 1000)
    val game = "(;SZ[9];B[aa];W[];B[bb];W[cc];B[])"
    assertEquals(SgfImport(game, actionCap = 4).left.map(_.move), Left(Some(5)))
    assertEquals(SgfImport(game, actionCap = 5).map(_.game.actions.size), Right(5))

  test("deep variations and long main lines are read without recursion"):
    val nested = "(;SZ[19]" + "(;C[x]" * 5000 + ")" * 5000 + ")"
    assert(SgfReader.parse(nested).isRight)
    val deep = "(;SZ[19]" + ";C[x]" * 9000 + ")"
    assert(SgfReader.parse(deep).isRight)

  test("malformed input is refused, never thrown"):
    val seed = "(;GM[1]FF[4]SZ[9]KM[6.5]AB[aa:bb]C[a\\]b];B[ee](;W[dd];B[])(;W[cc]C[x]))"
    val alphabet = "();[]\\:ABWCSZabcdeftt \n"
    val random = new Random(7)
    for n <- 1 to 3000 do
      val chars = seed.toCharArray
      for _ <- 0 to random.nextInt(4) do
        chars(random.nextInt(chars.length)) = alphabet(random.nextInt(alphabet.length))
      val text = new String(chars).take(random.nextInt(seed.length + 1) max 1)
      try SgfImport(text)
      catch case e: Throwable => fail(s"#$n threw on ${text}: $e")

  test("decode: UTF-8 by default, the CA charset when the JVM knows it, UTF-8 for an unknown one"):
    val latin = "(;CA[ISO-8859-1]PB[Réti])".getBytes(StandardCharsets.ISO_8859_1)
    assert(SgfReader.decode(latin).contains("Réti"))
    val utf8 = "﻿(;PB[Réti])".getBytes(StandardCharsets.UTF_8)
    assertEquals(SgfReader.decode(utf8), "(;PB[Réti])")
    val bogus = "(;CA[no-such-charset\u0000]PB[Réti])".getBytes(StandardCharsets.UTF_8)
    assert(SgfReader.decode(bogus).contains("Réti"))

  // The round trip: every server fixture's game that can be stored (9×9 or 19×19, no resumption), as
  // Sgf.write writes it, imports back to the same position and actions.
  test("every storable server fixture game round-trips through Sgf.write and the import"):
    var checked = 0
    for
      f <- Fixtures.forServer
      ruleset <- f.rulesets
    do
      val start = GoGame.start(Fixtures.setupOf(f, ruleset)).fold(e => fail(e.message), identity)
      val game = f.moves.foldLeft(start)((g, t) => Fixtures.applyToken(g, t).fold(_ => g, identity))
      if game.size != BoardSize.Thirteen && !game.actions.contains(Action.Resume) then
        val back = imported(Sgf.write(game)).game
        assertEquals(back.stones, game.stones, f.id)
        assertEquals(back.toMove, game.toMove, f.id)
        assertEquals(back.captures, game.captures, f.id)
        assertEquals(back.actions, game.actions, f.id)
        assertEquals(back.phase, game.phase, f.id)
        checked += 1
    assert(checked >= 150, s"only $checked games")
