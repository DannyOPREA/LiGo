package lila.game

import chess.{ ByColor, Clock, Color, MoveMetrics, Rated }
import ligo.gorules.{ Action, BoardSize, Point, Ruleset, Setup as GoSetup }
import reactivemongo.api.bson.*
import scalalib.model.Days

import lila.core.game.{ Game, GoScoring, Player, Pov, Source, newGoGame }
import lila.core.id.GamePlayerId
import lila.game.GameExt.*

// Unit 7.6 (ADR 0023 §4): "your turn" is asked two ways, `Pov.isMyTurn` on a game in memory and
// `GameRepo.countWhereUserTurn` as a Mongo selector (`Query.userTurn`). They must give the same answer.
// There is no Mongo here, so the selector runs against the game's stored document with a small matcher
// for the few operators it uses.
class GoUserTurnTest extends munit.FunSuite:

  import BSONHandlers.gameHandler

  private val t0 = java.time.Instant.parse("2026-10-04T12:00:00Z")
  private val whiteUser = UserId("white-user")
  private val blackUser = UserId("black-user")

  private def p(sgf: String) = Point.fromSgf(sgf).get

  private def newGo(handicap: Int = 0): Game =
    newGoGame(
      GoSetup(BoardSize.Nine, Ruleset.Japanese, if handicap > 1 then 0.5 else 6.5, handicap),
      none,
      ByColor(c =>
        Player(
          GamePlayerId(if c.white then "wwww" else "bbbb"),
          c,
          aiLevel = none,
          userId = Some(if c.white then whiteUser else blackUser)
        )
      ),
      rated = Rated.No,
      source = Source.Lobby,
      daysPerTurn = Some(Days(3))
    ).fold(e => fail(e.message), _.start.sloppy)

  private def play(g: Game, action: Action): Game =
    val next = g.go(action).fold(r => fail(s"refused $action: ${r.key}"), identity)
    g.applyGoMove(next, g.stepGoClock(MoveMetrics(), gameActive = g.goClockActiveAfter(next)).map(_.value))
      .game

  private def playAll(g: Game, tokens: String*): Game =
    tokens.foldLeft(g): (g, t) =>
      play(g, if t == "pass" then Action.Pass else Action.Place(p(t)))

  private def scoring(g: Game, accepted: Set[ligo.gorules.Color]): Game =
    val sc = GoScoring
      .waiting(t0, t0.plusSeconds(86400))
      .copy(
        proposal = Some(GoScoring.Proposal(Set.empty, GoScoring.Source.KataGo)),
        shown = 1,
        accepted = accepted
      )
    g.copy(goScoring = Some(sc))

  // ---- a tiny Mongo selector matcher: $or, $exists, $mod, $in, dotted paths into arrays and documents

  private def at(v: BSONValue, key: String): Option[BSONValue] = v match
    case d: BSONDocument => d.get(key)
    case a: BSONArray => key.toIntOption.flatMap(i => a.values.lift(i))
    case _ => None

  private def path(doc: BSONDocument, dotted: String): Option[BSONValue] =
    dotted.split('.').foldLeft(Option[BSONValue](doc))((v, k) => v.flatMap(at(_, k)))

  private def number(v: BSONValue): Option[Long] = v match
    case BSONInteger(i) => Some(i.toLong)
    case BSONLong(l) => Some(l)
    case _ => None

  private def matches(doc: BSONDocument, selector: BSONDocument): Boolean =
    selector.elements.forall:
      case BSONElement("$or", BSONArray(alternatives)) =>
        alternatives.exists:
          case alt: BSONDocument => matches(doc, alt)
          case _ => false
      case BSONElement(key, expected) => valueMatches(path(doc, key), expected)

  private def valueMatches(actual: Option[BSONValue], expected: BSONValue): Boolean = expected match
    case ops: BSONDocument if ops.elements.headOption.exists(_.name.startsWith("$")) =>
      ops.elements.forall:
        case BSONElement("$exists", BSONBoolean(want)) => actual.isDefined == want
        case BSONElement("$mod", BSONArray(Seq(d, r))) =>
          actual.flatMap(number).exists(n => n % number(d).get == number(r).get)
        case BSONElement("$in", BSONArray(options)) =>
          actual.exists(a =>
            options.contains(a) || number(a).exists(n => options.flatMap(number).contains(n))
          )
        case other => fail(s"the matcher doesn't know ${other.name}")
    case value =>
      actual.exists:
        case BSONArray(items) => items.contains(value)
        case a => a == value || (number(a).isDefined && number(a) == number(value))

  private def storedFor(g: Game): BSONDocument =
    gameHandler.write(g) ++ BSONDocument(
      lila.game.Game.BSONFields.playingUids -> List(whiteUser.value, blackUser.value)
    )

  private def agree(label: String, g: Game): Unit =
    val doc = storedFor(g)
    List(Color.White -> whiteUser, Color.Black -> blackUser).foreach: (color, user) =>
      val inMemory = Pov(g, color).isMyTurn
      val inMongo = matches(doc, Query.userTurn(user))
      assertEquals(inMongo, inMemory, s"$label, $color ($user): Mongo says $inMongo, Pov.isMyTurn $inMemory")

  private val B = ligo.gorules.Color.Black
  private val W = ligo.gorules.Color.White

  test("in play, the side to move has the turn, in an even game and a handicap game alike"):
    List(0, 2, 5).foreach: handicap =>
      val start = newGo(handicap)
      agree(s"start, handicap $handicap", start)
      val one = play(start, Action.Place(p("ab")))
      agree(s"one stone, handicap $handicap", one)
      agree(s"two stones, handicap $handicap", play(one, Action.Place(p("ih"))))
      agree(s"a pass, handicap $handicap", play(one, Action.Pass))

  test("in the scoring phase, each player who has not accepted has the turn"):
    List(0, 2).foreach: handicap =>
      // the ply's parity differs with how many stones were played, and with the handicap
      for
        stones <- List(List("ab", "ih"), List("ab"))
        accepted <- List(Set.empty[ligo.gorules.Color], Set(B), Set(W), Set(B, W))
      do
        val ended = playAll(newGo(handicap), (stones ::: List("pass", "pass"))*)
        assert(ended.goPlayEnds)
        val g = scoring(ended, accepted)
        agree(s"scoring, handicap $handicap, ${stones.size} stones, accepted $accepted, ply ${g.ply}", g)

  test("a player who has accepted no longer has the turn, the other still does"):
    val ended = playAll(newGo(), "ab", "ih", "pass", "pass")
    val blackAccepted = scoring(ended, Set(B))
    assert(!Pov(blackAccepted, Color.Black).isMyTurn)
    assert(Pov(blackAccepted, Color.White).isMyTurn)
    assert(!matches(storedFor(blackAccepted), Query.userTurn(blackUser)))
    assert(matches(storedFor(blackAccepted), Query.userTurn(whiteUser)))
    val both = scoring(ended, Set(B, W))
    assert(List(Color.White, Color.Black).forall(c => !Pov(both, c).isMyTurn))

  test("the matcher itself tells a game in play from a game being counted"):
    val inPlay = playAll(newGo(), "ab")
    assert(matches(storedFor(inPlay), Query.userTurn(whiteUser)), "White to move")
    assert(!matches(storedFor(inPlay), Query.userTurn(blackUser)))
