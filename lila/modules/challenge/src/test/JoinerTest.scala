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
