package lila.game

import chess.{ ByColor, Color, IntRating, Rated, Status }
import chess.rating.RatingProvisional
import ligo.gorules.{ Action, BoardSize, GameResult, Point, Ruleset, SgfTime, Setup as GoSetup }
import scalalib.model.Days

import lila.core.game.{ Game, Player, Source, newGoGame }
import lila.core.id.GamePlayerId

// Unit 4.11: a stored Go game as an SGF record.
class SgfDumpTest extends munit.FunSuite:

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
      g.withGo(g.go.get(a).fold(r => fail(s"refused $a: ${r.key}"), identity))

  private def place(sgf: String) = Action.Place(Point.fromSgf(sgf).get)

  private val played = act(newGo(), place("ee"), place("cc"))
  private val names = ByColor(white = "White Wendy", black = "Black Bob")

  private def finished(g: Game, status: Status, winner: Option[Color]) =
    g.copy(
      status = status,
      players = g.players.map(p => p.copy(isWinner = winner.map(_ == p.color)))
    )

  test("the record has the players, date and place, and the moves"):
    val sgf = SgfDump(played, names, "LiGo https://ligo.example/abcd").get
    assert(sgf.startsWith("(;GM[1]FF[4]CA[UTF-8]SZ[9]RU[Japanese]KM[6.5]"), sgf)
    assert(sgf.contains("PB[Black Bob]PW[White Wendy]"), sgf)
    assert(sgf.contains("RU[Japanese]"), sgf)
    assert(sgf.contains("PC[LiGo https://ligo.example/abcd]"), sgf)
    assert(sgf.contains(s"DT[${played.createdAt.atZone(java.time.ZoneOffset.UTC).toLocalDate}]"), sgf)
    assert(sgf.contains(";B[ee]\n;W[cc]"), sgf)

  test("an unfinished game has no result"):
    assertEquals(SgfDump.result(played), None)
    assert(!SgfDump(played, names, "x").get.contains("RE["))

  test("resignation, a flag and abandonment are written, other endings are not"):
    val b = Some(Color.Black)
    assertEquals(
      SgfDump.result(finished(played, Status.Resign, b)),
      Some(GameResult.Resigned(ligo.gorules.Color.Black))
    )
    assert(SgfDump(finished(played, Status.Resign, b), names, "x").get.contains("RE[B+R]"))
    assert(SgfDump(finished(played, Status.Outoftime, Some(Color.White)), names, "x").get.contains("RE[W+T]"))
    assert(SgfDump(finished(played, Status.Timeout, b), names, "x").get.contains("RE[B+F]"))
    // two passes without a count, aborted, no winner recorded: no RE until the scoring phase stores results
    assertEquals(SgfDump.result(finished(played, Status.UnknownFinish, None)), None)
    assertEquals(SgfDump.result(finished(played, Status.Aborted, None)), None)
    assertEquals(SgfDump.result(finished(played, Status.Resign, None)), None)

  test("ranks use the site's label, and are left out for an AI"):
    val rated = played.copy(players =
      played.players.map(p =>
        p.copy(
          rating = Some(IntRating(if p.color.white then 1960 else 1580)),
          provisional = RatingProvisional(p.color.black)
        )
      )
    )
    val info = SgfDump.info(rated, names, "x")
    assertEquals(info.whiteRank, Some("1d"))
    assertEquals(info.blackRank, Some("5k?"))
    val ai = played.copy(players = played.players.map(p => p.copy(aiLevel = Some(3))))
    assertEquals(SgfDump.info(ai, names, "x").blackRank, None)
    assertEquals(SgfDump.playerName(ai.blackPlayer, None), "LiGo AI level 3")
    assertEquals(SgfDump.playerName(played.blackPlayer, None), "Anonymous")

  test("time: Fischer from the clock, days per move for correspondence, none for an untimed game"):
    assertEquals(SgfDump.time(played), None)
    val corres = played.copy(daysPerTurn = Some(Days(3)))
    assertEquals(SgfDump.time(corres), Some(SgfTime.Correspondence(3)))
    assert(SgfDump(corres, names, "x").get.contains("OT[3 days per move]"))

  test("a game that is not Go has no SGF"):
    assertEquals(SgfDump(played.copy(go = None), names, "x"), None)
