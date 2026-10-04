package lila.ws

import chess.{ Centis, Color, MoveMetrics }

import lila.ws.ipc.*

// Unit 3.14 (ADR 0019 §6): the round's Go messages through lila-ws, browser → lila and lila → mini boards.
class GoRoundTest extends munit.FunSuite:

  private def parse(js: String) = ClientOut.parse(js).get

  private def unexpected(js: String) = parse(js) match
    case ClientOut.Unexpected(_) => true
    case _ => false

  test("a Go move from the browser: an SGF point, with blur, ack id and lag"):
    assertEquals(
      parse("""{"t":"move","d":{"u":"dd","b":1,"a":3,"l":20,"s":"a"}}"""),
      ClientOut.RoundMove(GoMove("dd"), true, ClientMoveMetrics(Some(Centis(2)), Some(Centis(10))), Some(3))
    )

  test("a pass from the browser"):
    assertEquals(
      parse("""{"t":"move","d":{"u":"pass"}}"""),
      ClientOut.RoundMove(GoMove.pass, false, ClientMoveMetrics(), None)
    )

  test("the corners of a 19×19 board are read, anything else is not"):
    assertEquals(List("aa", "as", "sa", "ss").flatMap(GoMove.read).map(_.value), List("aa", "as", "sa", "ss"))
    List("ta", "at", "a", "aaa", "AA", "e2e4", "e7e8q", "Pass", "", "d4").foreach: s =>
      assertEquals(GoMove.read(s), None, s)

  test("chess moves, drops and malformed moves are not relayed"):
    assert(unexpected("""{"t":"move","d":{"u":"e2e4"}}"""))
    assert(unexpected("""{"t":"move","d":{"from":"e2","to":"e4"}}"""))
    assert(unexpected("""{"t":"drop","d":{"role":"knight","pos":"e4"}}"""))
    assert(unexpected("""{"t":"move","d":{"u":"zz"}}"""))
    assert(unexpected("""{"t":"move","d":{}}"""))

  test("the move goes to lila as r/move, in the shape lila's RoundSocket reads"):
    val fullId = Game.FullId("abcdefghwxyz")
    assertEquals(
      LilaIn.RoundMove(fullId, GoMove("pd"), true, MoveMetrics(Some(Centis(2)), None, Some(Centis(1)))).write,
      "r/move abcdefghwxyz pd + 2 - 1"
    )
    assertEquals(
      LilaIn.RoundMove(fullId, GoMove.pass, false, MoveMetrics()).write,
      "r/move abcdefghwxyz pass - - - -"
    )

  // lila's Event.GoMove data (lila/modules/game/src/main/Event.scala, GoPlayTest.scala)
  private val stone =
    """{"p":"ee","ply":2,"cap":[],"prisoners":{"b":0,"w":0},"phase":"play","board":"9/9/9/9/4b4/9/9/9/9","clock":{"white":60,"black":61.5,"lag":3}}"""

  test("a stone feeds the mini board: move, stones, clocks in seconds and the player to move"):
    assertEquals(
      Fens.readMove(JsonString(stone), Some(Color.Black)),
      Some(MiniBoard(GoMove("ee"), "9/9/9/9/4b4/9/9/9/9", Some(Clock(60, 61)), Color.White))
    )

  test("a pass, a capture with a ko, and a game without a clock"):
    val pass =
      """{"pass":true,"ply":3,"cap":[],"prisoners":{"b":0,"w":0},"phase":"play","board":"9/9/9/9/4b4/9/9/9/9"}"""
    assertEquals(
      Fens.readMove(JsonString(pass), Some(Color.White)),
      Some(MiniBoard(GoMove.pass, "9/9/9/9/4b4/9/9/9/9", None, Color.Black))
    )
    val capture =
      """{"p":"ba","ply":4,"cap":["aa"],"prisoners":{"b":1,"w":0},"phase":"play","board":"1b7/b8/9/9/9/9/9/9/9","ko":"aa","clock":{"white":58.2,"black":59}}"""
    assertEquals(
      Fens.readMove(JsonString(capture), Some(Color.Black)).map(b => (b.lastMove.value, b.board, b.clock)),
      Some(("ba", "1b7/b8/9/9/9/9/9/9/9", Some(Clock(58, 59))))
    )

  test("a byo-yomi clock adds each side's periods left to the mini board (unit 4.7)"):
    val js =
      """{"p":"ee","ply":2,"cap":[],"prisoners":{"b":0,"w":0},"phase":"play","board":"9/9/9/9/4b4/9/9/9/9","clock":{"white":25.3,"black":600,"periods":{"b":5,"w":2},"byo":30}}"""
    val board = Fens.readMove(JsonString(js), Some(Color.Black)).get
    assertEquals(board.clock, Some(Clock(25, 600, Some((2, 5)))))
    assertEquals(
      ClientIn.Fen(Game.Id("abcdefgh"), board).write,
      """{"t":"fen","d":{"id":"abcdefgh","lm":"ee","board":"9/9/9/9/4b4/9/9/9/9","turn":"white","wc":25,"bc":600,"wp":2,"bp":5}}"""
    )

  test("a watcher sees a game without clocks, and Black to move when lila names no mover"):
    val js =
      """{"p":"dd","ply":1,"cap":[],"prisoners":{"b":0,"w":0},"phase":"play","board":"9/9/9/3w5/9/9/9/9/9"}"""
    val board = Fens.readMove(JsonString(js), None).get
    assertEquals(board.turnColor, Color.Black)
    assertEquals(
      ClientIn.Fen(Game.Id("abcdefgh"), board).write,
      """{"t":"fen","d":{"id":"abcdefgh","lm":"dd","board":"9/9/9/3w5/9/9/9/9/9","turn":"black"}}"""
    )

  test("the second pass, which opens the scoring phase, still updates the mini board"):
    val js =
      """{"pass":true,"ply":3,"cap":[],"prisoners":{"b":0,"w":0},"phase":"scoring","board":"9/9/9/9/9/9/9/9/9","status":38}"""
    assertEquals(Fens.readMove(JsonString(js), Some(Color.White)).map(_.lastMove), Some(GoMove.pass))

  test("chess and malformed events are ignored"):
    List(
      """{"uci":"e2e4","san":"e4","fen":"rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR","ply":1}""",
      """{"p":"ee","ply":2}""",
      """{"p":"ee","board":"<script>"}""",
      """{"pass":false,"board":"9/9/9/9/9/9/9/9/9"}""",
      """not json""",
      """[]"""
    ).foreach: js =>
      assertEquals(Fens.readMove(JsonString(js), Some(Color.Black)), None, js)

  test("the mini-board message the browser gets"):
    val board = Fens.readMove(JsonString(stone), Some(Color.Black)).get
    assertEquals(
      ClientIn.Fen(Game.Id("abcdefgh"), board).write,
      """{"t":"fen","d":{"id":"abcdefgh","lm":"ee","board":"9/9/9/9/4b4/9/9/9/9","turn":"white","wc":60,"bc":61}}"""
    )

  test("the scoring phase's toggle, accept and resume go to lila as r/do with their data (unit 4.8)"):
    val fullId = Game.FullId("abcdefghwxyz")
    List(
      """{"t":"score-toggle","d":{"p":"pd","v":"2:3"}}""",
      """{"t":"score-accept","d":{"v":"2:3"}}""",
      """{"t":"score-resume"}"""
    ).foreach: js =>
      parse(js) match
        case ClientOut.RoundPlayerForward(payload) =>
          assertEquals(LilaIn.RoundPlayerDo(fullId, payload).write, s"r/do abcdefghwxyz $js")
        case other => fail(s"$js parsed as $other")
