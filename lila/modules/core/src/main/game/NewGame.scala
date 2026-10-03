package lila.core
package game

import _root_.chess.{ ByColor, Clock, Rated, Status }
import ligo.gorules.{ GoGame, Setup as GoSetup, SetupError }
import scalalib.ThreadLocalRandom
import scalalib.model.Days

import lila.core.id.GameId

// Wrapper around newly created games. We do not know if the id is unique, yet.
case class NewGame(sloppy: Game):
  def withId(id: GameId): Game = sloppy.copy(id = id)
  def start: NewGame = NewGame(sloppy.start)

/** A new Go game (ADR 0019 §3): the rules state from `setup`, the ply it starts at, and the Fischer clock set
  * to the side that moves first.
  */
def newGoGame(
    setup: GoSetup,
    clock: Option[Clock],
    players: ByColor[Player],
    rated: Rated,
    source: Source,
    daysPerTurn: Option[Days] = None,
    rules: Set[GameRule] = Set.empty
): Either[SetupError, NewGame] =
  GoGame
    .start(setup)
    .map: go =>
      val startedAtPly = GoBridge.startedAtPly(go)
      // chess.Clock starts with White's side; a Black-first game starts Black's (ADR 0019 §5).
      val firstClock = clock.map(_.copy(color = GoBridge.color(go.toMove)))
      val createdAt = nowInstant
      NewGame:
        new Game(
          id = IdGenerator.uncheckedGame,
          players = players,
          go = go,
          ply = startedAtPly,
          startedAtPly = startedAtPly,
          clock = firstClock,
          status = Status.Created,
          daysPerTurn = daysPerTurn,
          // Go games are casual until unit 5.7 turns rated play on, whatever an older record or game asks for
          rated = Rated.No,
          metadata = newMetadata(source).copy(rules = rules),
          createdAt = createdAt,
          movedAt = createdAt
        )

trait IdGenerator:
  def game: Fu[GameId]
  def games(nb: Int): Fu[List[GameId]]
  def withUniqueId(sloppy: NewGame): Fu[Game]
object IdGenerator:
  def uncheckedGame: GameId = GameId(ThreadLocalRandom.nextString(GameId.size))
