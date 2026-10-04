package lila.challenge

import chess.variant.Standard
import chess.{ Clock, Color, Ply }
import ligo.gorules.{ BoardSize, Ruleset, Setup as GoSetup }

import lila.core.game.GoSetups

// Unit 3.15: accepting a challenge creates a Go game from the challenge's setup.
final class JoinerTest extends munit.FunSuite:

  val timeControl =
    Challenge.TimeControl.Clock(Clock.Config(Clock.LimitSeconds(300), Clock.IncrementSeconds(0)))

  private def challenge(go: GoSetup) = Challenge.make(
    variant = Standard,
    initialFen = None,
    go = go,
    timeControl = timeControl,
    rated = chess.Rated.No,
    color = "white",
    challenger = Challenge.Challenger.Anonymous("secret"),
    destUser = None,
    rematchOf = None
  )

  private def created(c: Challenge) = ChallengeJoiner.createGame(c, None, None).fold(fail(_), identity)

  test("an even Go game from the challenge's setup, Black to move at ply 1"):
    val nine = GoSetup(BoardSize.Nine, Ruleset.Chinese, 7.5)
    val game = created(challenge(nine))
    assertEquals(game.go.map(_.setup), Some(nine))
    assertEquals((game.startedAtPly, game.turnColor), (Ply(1), Color.Black))
    assertEquals(game.clock.map(_.color), Some(Color.Black))
    assertEquals(game.perfKey, lila.core.game.GoBridge.perfKey)

  test("a challenge made before unit 3.15 has no setup and gets the default"):
    val old = challenge(GoSetups.default).copy(go = None)
    assertEquals(created(old).go.map(_.setup), Some(GoSetups.default))

  test("the challenge stores its setup with the game's Go keys"):
    import BSONHandlers.given
    import reactivemongo.api.bson.*
    val c = challenge(GoSetup(BoardSize.Thirteen, Ruleset.Japanese, 0.5))
    val doc = summon[BSONDocumentHandler[Challenge]].writeTry(c).get
    assertEquals(
      doc.getAsOpt[BSONDocument]("go").map(d => (d.int("sz"), d.string("ru"), d.int("km"), d.contains("hc"))),
      Some((Some(13), Some("j"), Some(1), false))
    )
    assertEquals(summon[BSONDocumentHandler[Challenge]].readTry(doc).toOption.flatMap(_.go), c.go)

  // Unit 4.9: byo-yomi and handicap challenges.
  private val byoyomi = Challenge.TimeControl.Byoyomi(ligo.gorules.ByoyomiConfig(600, 5, 30))

  test("a byo-yomi challenge makes a game with a byo-yomi clock and no Fischer clock"):
    val game = created(challenge(GoSetups.default).copy(timeControl = byoyomi))
    assertEquals(game.byoyomi.map(_.config), Some(byoyomi.config))
    assertEquals(game.clock, None)
    // strategygames' estimate is main time + 25 × every period: 600 + 25 × 5 × 30 s is classical
    assertEquals(challenge(GoSetups.default).copy(timeControl = byoyomi).speed, chess.Speed.Classical)

  test("a handicap challenge puts Black's stones down and gives White the first move"):
    val four = GoSetup(BoardSize.Nineteen, Ruleset.Japanese, 0.5, handicap = 4)
    val game = created(challenge(four))
    assertEquals(game.go.map(_.setup.handicap), Some(4))
    assertEquals(game.turnColor, Color.White)
    assertEquals(game.go.map(_.stones.size), Some(4))

  test("a byo-yomi challenge is stored with its main time under `l`, so it counts as real-time"):
    import BSONHandlers.given
    import reactivemongo.api.bson.*
    val c = challenge(GoSetups.default).copy(timeControl = byoyomi)
    val doc = summon[BSONDocumentHandler[Challenge]].writeTry(c).get
    assertEquals(
      doc
        .getAsOpt[BSONDocument]("timeControl")
        .map(d => (d.int("l"), d.int("p"), d.int("b"), d.contains("i"))),
      Some((Some(600), Some(5), Some(30), false))
    )
    assertEquals(
      summon[BSONDocumentHandler[Challenge]].readTry(doc).toOption.map(_.timeControl),
      Some(byoyomi)
    )
