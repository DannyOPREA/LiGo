package lila.game

import chess.{ ByColor, Rated }
import ligo.gorules.{ BoardSize, Ruleset, Setup as GoSetup }

import lila.core.game.{ Player, Source, newGoGame }

// Units 4.9 and 5.7: who plays which colour in a Go game's rematch
class GoRematchTest extends munit.FunSuite:

  private def game(setup: GoSetup) =
    newGoGame(
      setup,
      none,
      ByColor(c => Player(GamePlayerId(if c.white then "wwww" else "bbbb"), c, none)),
      Rated.No,
      Source.Friend
    ).fold(e => fail(e.message), _.sloppy)

  test("an even game's rematch swaps the colours"):
    assert(rematchAlternatesColor(game(GoSetup(BoardSize.Nineteen, Ruleset.Japanese, 6.5)), Nil))

  test("a handicap game's rematch keeps the colours, so Black gets the stones again"):
    for n <- List(1, 2, 5) do
      assert(!rematchAlternatesColor(game(GoSetup(BoardSize.Nineteen, Ruleset.Japanese, 0.5, n)), Nil), n)
