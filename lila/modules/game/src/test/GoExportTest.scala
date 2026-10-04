package lila.game

import chess.{ ByColor, Rated }
import ligo.gorules.{ Action, BoardSize, Point, Ruleset, Setup as GoSetup }
import play.api.libs.json.*

import lila.core.game.{ Game, GoBridge, Player, Source, WithInitialFen, newGoGame }
import lila.core.id.GamePlayerId

// Unit 3.16: what the API's exports and streams send for a Go game, and how a light game knows it is one.
class GoExportTest extends munit.FunSuite:

  private def newGo(handicap: Int = 0): Game =
    newGoGame(
      GoSetup(BoardSize.Nine, Ruleset.Japanese, if handicap > 0 then 0.5 else 6.5, handicap),
      none,
      ByColor(c => Player(GamePlayerId(if c.white then "wwww" else "bbbb"), c, aiLevel = none)),
      rated = Rated.No,
      source = Source.Lobby
    ).fold(e => fail(e.message), _.sloppy)

  private def act(g: Game, actions: Action*): Game =
    actions.foldLeft(g): (g, a) =>
      g.withGo(g.go(a).fold(r => fail(s"refused $a: ${r.key}"), identity))

  private def place(sgf: String) = Action.Place(Point.fromSgf(sgf).get)

  // Black captures White's stone at aa, then a pass.
  private val played: Game = act(newGo(), place("ab"), place("aa"), place("ba"), Action.Pass)

  test("moves are SGF points and pass"):
    assertEquals(JsonView.goMoves(played.go), Vector("ab", "aa", "ba", "pass"))

  test("the setup block has no moves, the full block adds them"):
    val setup = JsonView.goSetup(played.go)
    assertEquals((setup \ "size").as[Int], 9)
    assertEquals((setup \ "rules").as[String], "japanese")
    assertEquals((setup \ "komi").as[Double], 6.5)
    assert((setup \ "moves").isEmpty)
    assert((setup \ "handicap").isEmpty)
    val full = JsonView.go(played.go)
    assertEquals((full \ "moves").as[String], "ab aa ba pass")
    assertEquals((full \ "size").as[Int], 9)
    assertEquals((JsonView.goSetup(newGo(2).go) \ "handicap").as[Int], 2)

  test("boards: the start, then one per action, ending on the game's own"):
    val go = played.go
    val boards = JsonView.goBoards(go).get
    assertEquals(boards.size, go.actions.size + 1)
    assertEquals(boards.head, "9/9/9/9/9/9/9/9/9")
    assertEquals(boards.last, GoBridge.board(go))
    assertEquals(boards(3), "1b7/b8/9/9/9/9/9/9/9") // the capture at aa
    assertEquals(boards(4), boards(3)) // a pass changes nothing
    val handicap = newGo(2).go
    assertEquals(JsonView.goBoards(handicap).get, Vector(GoBridge.board(handicap)))

  test("the game stream sends the Go setup instead of a chess variant"):
    val js = GameStream.toJson(none)(WithInitialFen(played, none))
    assert((js \ "variant").isEmpty)
    assert((js \ "initialFen").isEmpty)
    assertEquals((js \ "go" \ "size").as[Int], 9)
    assertEquals((js \ "perf").as[String], "go")

  test("a light game knows a Go game from a chess one"):
    import BSONHandlers.{ gameHandler, lightGameReader }
    val doc = gameHandler.write(played)
    assert(lightGameReader.readDocument(doc).get.isGo)
    assert(!lightGameReader.readDocument(doc -- GoStorage.F.size).get.isGo)
    assert(LightGame.projection.contains(GoStorage.F.size))
