package lila.game

import chess.{ ByColor, Clock, Color, Ply, Rated }
import ligo.gorules.{
  Action,
  BoardSize,
  Color as GoColor,
  GoGame,
  Point,
  Position,
  Ruleset,
  Setup as GoSetup
}
import reactivemongo.api.bson.*

import lila.core.game.{ Game, GoBridge, Player, Source, newGoGame }
import lila.core.id.GamePlayerId
import lila.db.dsl.{ *, given }

// Unit 3.12 (ADR 0019 §3–4): a Go game is stored as its setup and actions and loaded by replaying them.
class GoStorageTest extends munit.FunSuite:

  import BSONHandlers.gameHandler

  private def setup(size: BoardSize = BoardSize.Nine, handicap: Int = 0, position: Option[Position] = None) =
    GoSetup(size, Ruleset.Japanese, if handicap > 0 then 0.5 else 6.5, handicap, position)

  private def newGo(s: GoSetup, clock: Option[Clock] = None): Game =
    newGoGame(
      s,
      clock,
      ByColor(c => Player(GamePlayerId(if c.white then "wwww" else "bbbb"), c, aiLevel = none)),
      rated = Rated.No,
      source = Source.Lobby
    ).fold(e => fail(e.message), _.sloppy)

  private def p(sgf: String) = Point.fromSgf(sgf).get

  private def act(g: Game, actions: Action*): Game =
    actions.foldLeft(g): (g, a) =>
      g.withGo(g.go.get(a).fold(r => fail(s"refused $a: ${r.key}"), identity))

  private def roundTrip(g: Game): Game = gameHandler.read(gameHandler.write(g))

  private val chessKeys = List("hp", "pg", "ps", "ph", "cl", "ur", "cc", "chd", "if", "v", "pgni", "do")

  // An even game: Black captures at aa, two passes, a resume and one more stone.
  private def played: Game =
    act(
      newGo(setup()),
      List("ab", "aa", "ba", "ee").map(s => Action.Place(p(s))) ++
        List(Action.Pass, Action.Pass, Action.Resume, Action.Place(p("cc")))*
    )

  test("a new Go game: Black-first starts at ply 1 with Black's clock, a handicap game at ply 0"):
    val clock = Clock(Clock.LimitSeconds(300), Clock.IncrementSeconds(3)).some
    val even = newGo(setup(), clock)
    assertEquals((even.startedAtPly, even.ply, even.turnColor), (Ply(1), Ply(1), Color.Black))
    assertEquals(even.clock.map(_.color), Some(Color.Black))
    assertEquals(even.perfKey, GoBridge.perfKey)
    val handicap = newGo(setup(BoardSize.Nineteen, handicap = 4), clock)
    assertEquals((handicap.startedAtPly, handicap.turnColor), (Ply(0), Color.White))
    assertEquals(handicap.clock.map(_.color), Some(Color.White))

  test("the ply counts placements and passes, not resumes"):
    val g = played
    assertEquals(g.playedPlies, Ply(7))
    assertEquals(g.go.get.actions.size, 8)
    assertEquals(g.turnColor, GoBridge.color(g.go.get.toMove))

  test("a Go game is stored with its Go block and none of the chess keys"):
    val doc = gameHandler.write(played)
    assertEquals(doc.getAsOpt[Int]("sz"), Some(9))
    assertEquals(doc.getAsOpt[String]("ru"), Some("j"))
    assertEquals(doc.getAsOpt[Int]("km"), Some(13))
    assert(!doc.contains("hc"), "no handicap key for an even game")
    assert(!doc.contains("ip"))
    assertEquals(doc.getAsOpt[Array[Byte]]("ac").map(_.length), Some(16))
    assertEquals(chessKeys.filter(doc.contains), Nil)
    assertEquals(doc.getAsOpt[Int]("t"), Some(8))

  test("BSON round trip: position, captures, turn, ply, clock and actions come back"):
    val clock = Clock(Clock.LimitSeconds(300), Clock.IncrementSeconds(3)).some
    val g = act(newGo(setup(), clock), Action.Place(p("ee")), Action.Place(p("cc")))
    for original <- List(played, g, newGo(setup(BoardSize.Nineteen, handicap = 4), clock)) do
      val back = roundTrip(original)
      val (a, b) = (original.go.get, back.go.get)
      assertEquals(b.setup, a.setup)
      assertEquals(b.actions, a.actions)
      assertEquals(b.stones, a.stones)
      assertEquals(b.captures, a.captures)
      assertEquals(b.phase, a.phase)
      assertEquals(b.koPoint, a.koPoint)
      assertEquals(
        (back.ply, back.startedAtPly, back.turnColor),
        (original.ply, original.startedAtPly, original.turnColor)
      )
      assertEquals(back.clock.map(_.config), original.clock.map(_.config))
      assertEquals(back.clock.map(_.color), original.clock.map(_.color))
      assertEquals(back.perfKey, GoBridge.perfKey)
    assertEquals(roundTrip(played).go.get.captures.black, 1)

  test("BSON round trip: a custom starting position and a handicap"):
    val position = Position(Map(p("cc") -> GoColor.Black, p("gg") -> GoColor.White), GoColor.White)
    val custom = act(newGo(setup(position = Some(position))), Action.Place(p("ee")))
    val doc = gameHandler.write(custom)
    assertEquals(
      doc
        .getAsOpt[Bdoc]("ip")
        .map(d => (d.getAsOpt[String]("b"), d.getAsOpt[String]("w"), d.getAsOpt[String]("m"))),
      Some((Some("cc"), Some("gg"), Some("w")))
    )
    val back = roundTrip(custom)
    assertEquals(back.go.get.setup.position, Some(position))
    assertEquals(back.go.get.stones, custom.go.get.stones)
    assertEquals((back.startedAtPly, back.turnColor), (Ply(0), Color.Black))
    val hc = gameHandler.write(newGo(setup(BoardSize.Nineteen, handicap = 4)))
    assertEquals(hc.getAsOpt[Int]("hc"), Some(4))
    assertEquals(hc.getAsOpt[Int]("km"), Some(1))

  test("a corrupt document loads the game up to the first refused action"):
    val doc = gameHandler.write(played)
    val good = doc.getAsOpt[Array[Byte]]("ac").get
    // the 4th action replaced by a point already taken, then an odd trailing byte
    val bad = good.clone()
    bad(6) = good(0); bad(7) = good(1)
    val back = gameHandler.read(doc ++ bdoc("ac" -> (bad :+ 1.toByte)))
    assertEquals(back.go.get.actions, played.go.get.actions.take(3))
    assertEquals(back.ply, Ply(1 + 3))
    // a point off the board is refused too
    val offBoard = gameHandler.read(doc ++ bdoc("ac" -> Array[Byte](0, 81.toByte)))
    assertEquals(offBoard.go.get.actions, Vector.empty)
    // a setup that can't be read is an error, not a chess game
    assert(gameHandler.readDocument(doc ++ bdoc("sz" -> 10)).isFailure)

  test("GameDiff writes the actions and the ply, and no chess key"):
    val before = act(newGo(setup()), Action.Place(p("ee")))
    val after = act(before, Action.Place(p("cc")))
    val (sets, unsets) = GameDiff(before, after)
    assertEquals(sets.map(_._1).toSet, Set("ac", "t"))
    assertEquals(unsets, Nil)
    val stored = gameHandler.write(before) ++ BSONDocument(sets)
    assertEquals(gameHandler.read(stored).go.get.actions, after.go.get.actions)

  // ADR 0019 §3: game lists load many games, so a 300-move 19x19 replay must stay cheap.
  test("replaying a 300-move 19x19 game is fast"):
    val rnd = scala.util.Random(3012)
    val start = GoGame.start(setup(BoardSize.Nineteen)).toOption.get
    val game = (1 to 300).foldLeft(start): (g, _) =>
      val legal = g.legalPoints
      if legal.isEmpty then g.pass.toOption.get
      else g.play(legal(rnd.nextInt(legal.size))).toOption.get
    assertEquals(GoBridge.plies(game), 300)
    val bytes = GoStorage.actions.write(game.actions, BoardSize.Nineteen)
    assertEquals(bytes.length, 600)
    def load() = GoGame.replay(game.setup, GoStorage.actions.read(bytes, BoardSize.Nineteen))
    (1 to 5).foreach(_ => load()) // warm up
    val times = (1 to 20).map: _ =>
      val t0 = System.nanoTime
      assertEquals(load().map(_.stones), Right(game.stones))
      (System.nanoTime - t0) / 1_000_000d
    val median = times.sorted.apply(times.size / 2)
    println(f"300-move 19x19 replay: median $median%.2f ms, max ${times.max}%.2f ms (20 runs)")
    assert(median < 250, s"median replay $median ms")
