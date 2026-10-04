package lila.core
package game

import ligo.gorules.{ BoardSize, Ruleset, Setup as GoSetup }
import reactivemongo.api.bson.*

import lila.core.userId.UserId

// Unit 3.15: the board size, ruleset and komi a new Go game is created with.
class GoSetupsTest extends munit.FunSuite:

  import GoSetups.given

  test("the default is 19x19, Japanese rules, 6.5 komi"):
    assertEquals(GoSetups.default, GoSetup(BoardSize.Nineteen, Ruleset.Japanese, 6.5))

  test("komi defaults to the ruleset's standard komi"):
    assertEquals(GoSetups.make(9, "chinese", None), Right(GoSetup(BoardSize.Nine, Ruleset.Chinese, 7.5)))
    assertEquals(
      GoSetups.make(13, "japanese", None),
      Right(GoSetup(BoardSize.Thirteen, Ruleset.Japanese, 6.5))
    )
    assertEquals(GoSetups.make(19, "japanese", Some(0.5)).map(_.komi), Right(0.5))
    assertEquals(GoSetups.make(9, "chinese", Some(-3.0)).map(_.komi), Right(-3.0))

  test("a board size, ruleset or komi the rules don't allow is refused"):
    assert(GoSetups.make(10, "japanese", None).isLeft)
    assert(GoSetups.make(19, "aga", None).isLeft)
    assert(GoSetups.make(9, "japanese", Some(6.3)).isLeft, "not a multiple of 0.5")
    assert(GoSetups.make(9, "japanese", Some(81.5)).isLeft, "bigger than the 9x9 board")
    assert(GoSetups.make(19, "japanese", Some(81.5)).isRight)

  test("standard komi is what rated games need (ADR 0021 §4)"):
    assert(GoSetups.hasStandardKomi(GoSetups.default))
    assert(!GoSetups.hasStandardKomi(GoSetups.default.copy(komi = 5.5)))
    assert(GoSetups.hasStandardKomi(GoSetups.default.copy(handicap = 3, komi = 0.5)))

  test("stored with the game's Go keys and read back"):
    val setup = GoSetup(BoardSize.Nine, Ruleset.Chinese, 7.5)
    val doc = BSON.writeDocument(setup).get
    assertEquals(
      (doc.getAsOpt[Int]("sz"), doc.getAsOpt[String]("ru"), doc.getAsOpt[Int]("km"), doc.contains("hc")),
      (Some(9), Some("c"), Some(15), false)
    )
    assertEquals(BSON.readDocument[GoSetup](doc).toOption, Some(setup))
    val handicap = GoSetups.default.copy(handicap = 4, komi = 0.5)
    assertEquals(BSON.readDocument[GoSetup](BSON.writeDocument(handicap).get).toOption, Some(handicap))
    assert(BSON.readDocument[GoSetup](doc ++ BSONDocument("sz" -> 10)).isFailure)

  test("its JSON has the keys of a game's own go block"):
    val js = GoSetups.json(GoSetup(BoardSize.Thirteen, Ruleset.Chinese, 7.5))
    assertEquals((js \ "size").as[Int], 13)
    assertEquals((js \ "rules").as[String], "chinese")
    assertEquals((js \ "komi").as[Double], 7.5)
    assert((js \ "handicap").toOption.isEmpty)

  // Unit 5.7: rated games (ADR 0021 §4–§5)
  private def players(signedIn: Boolean) = _root_.chess.ByColor(c =>
    Player(
      lila.core.id.GamePlayerId(if c.white then "wwww" else "bbbb"),
      c,
      none,
      userId = signedIn.option(UserId(if c.white then "white" else "black"))
    )
  )
  private def ratedOf(setup: GoSetup, signedIn: Boolean = true) =
    newGoGame(setup, none, players(signedIn), _root_.chess.Rated.Yes, Source.Lobby).map(_.sloppy.rated)

  test("a new Go game between two signed-in players is rated when asked for"):
    assertEquals(ratedOf(GoSetups.default), Right(_root_.chess.Rated.Yes))
    assertEquals(
      newGoGame(GoSetups.default, none, players(true), _root_.chess.Rated.No, Source.Lobby)
        .map(_.sloppy.rated),
      Right(_root_.chess.Rated.No)
    )

  test("a new Go game with a guest in it is casual, even when asked for a rated one"):
    assertEquals(ratedOf(GoSetups.default, signedIn = false), Right(_root_.chess.Rated.No))

  test("a new Go game the rating maths doesn't cover is casual, even when asked for a rated one"):
    assertEquals(ratedOf(GoSetup(BoardSize.Thirteen, Ruleset.Japanese, 6.5)), Right(_root_.chess.Rated.No))
    assertEquals(ratedOf(GoSetup(BoardSize.Nineteen, Ruleset.Japanese, 7.5)), Right(_root_.chess.Rated.No))
    assertEquals(
      ratedOf(GoSetup(BoardSize.Nine, Ruleset.Japanese, 0.5, handicap = 5)),
      Right(_root_.chess.Rated.No)
    )

  test("a rated game may have up to 9 stones on 19x19 and 4 on 9x9, with the spec's komi"):
    assertEquals(GoSetups.ratedRefusal(GoSetup(BoardSize.Nineteen, Ruleset.Chinese, 0.5, handicap = 9)), None)
    assertEquals(GoSetups.ratedRefusal(GoSetup(BoardSize.Nine, Ruleset.Japanese, 0.5, handicap = 4)), None)
    assertEquals(GoSetups.ratedRefusal(GoSetup(BoardSize.Nine, Ruleset.Chinese, 7.5)), None)
    assert(GoSetups.ratedRefusal(GoSetup(BoardSize.Nine, Ruleset.Japanese, 0.5, handicap = 5)).isDefined)
    assert(GoSetups.ratedRefusal(GoSetup(BoardSize.Nineteen, Ruleset.Japanese, 6.5, handicap = 2)).isDefined)
    assert(GoSetups.ratedRefusal(GoSetup(BoardSize.Thirteen, Ruleset.Japanese, 6.5)).isDefined)
