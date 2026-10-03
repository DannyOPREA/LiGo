package lila.round

import chess.Color
import ligo.gorules.{ Action, BoardSize, GoGame, Point, Ruleset, Setup }

import lila.core.game.GoBridge

// Unit 3.16: the API move stream's positions for a Go game, which pick the player to move and the clock
// times of each one.
class GoMoveStreamTest extends munit.FunSuite:

  private def place(sgf: String) = Action.Place(Point.fromSgf(sgf).get)

  private def game(handicap: Int, actions: Action*): GoGame =
    val start = GoGame
      .start(Setup(BoardSize.Nine, Ruleset.Japanese, if handicap > 0 then 0.5 else 6.5, handicap))
      .fold(e => fail(e.message), identity)
    actions.foldLeft(start): (g, a) =>
      g(a).fold(r => fail(s"refused $a: ${r.key}"), identity)

  private def frames(g: GoGame) = ApiMoveStream.goFrames(g).getOrElse(fail("no frames"))

  test("an even game: Black moves first, a pass is a position"):
    val g = game(0, place("cc"), place("gg"), Action.Pass)
    val fs = frames(g)
    assertEquals(fs.map(_.turn), Vector(Color.Black, Color.White, Color.Black, Color.White))
    assertEquals(fs.map(_.lastMove), Vector(None, Some("cc"), Some("gg"), Some("pass")))
    assertEquals(fs.map(_.plyIndex), Vector(0, 1, 2, 3))
    assertEquals(fs.last.board, GoBridge.board(g))
    assertEquals(fs(3).board, fs(2).board)

  test("a handicap game: White moves first"):
    val fs = frames(game(2, place("ee"), place("cc")))
    assertEquals(fs.map(_.turn), Vector(Color.White, Color.Black, Color.White))
    assertEquals(fs.map(_.plyIndex), Vector(0, 1, 2))

  test("a resume sends no position and doesn't shift the turn or the clock index"):
    val g = game(0, place("cc"), Action.Pass, Action.Pass, Action.Resume, place("gg"))
    val fs = frames(g)
    assertEquals(fs.map(_.lastMove), Vector(None, Some("cc"), Some("pass"), Some("pass"), Some("gg")))
    assertEquals(fs.map(_.plyIndex), Vector(0, 1, 2, 3, 4))
    assertEquals(fs(3).turn, GoBridge.color(game(0, place("cc"), Action.Pass, Action.Pass).toMove))
    assertEquals(fs.last.turn, GoBridge.color(g.toMove))
    assertEquals(fs.last.board, GoBridge.board(g))
