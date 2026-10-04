package lila.core
package game

import _root_.chess.{
  ByColor,
  Centis,
  Clock,
  Color,
  CorrespondenceClock,
  Rated,
  Ply,
  Speed,
  Status,
  Outcome,
  IntRating
}
import ligo.gorules.{ ByoyomiClock, GoGame }
import scalalib.model.Days

import lila.core.id.{ GameFullId, GameId, GamePlayerId }
import lila.core.perf.PerfKey
import lila.core.user.User
import lila.core.userId.{ UserId, UserIdOf }
import lila.core.game.ClockHistory.bothClockStates

case class Game(
    id: GameId,
    players: ByColor[Player],
    // The game's rules state (ADR 0019 §3): the position, turn, captures, ko point and phase, from
    // libs/go-rules.
    go: GoGame,
    // The ply count (placements and passes), the ply the game started at and the Fischer clock.
    ply: Ply,
    startedAtPly: Ply,
    clock: Option[Clock],
    // Reads the clock history (`cw`, `cb`) for the game's clock, Fischer or byo-yomi.
    loadClockHistory: GameClock => Option[ClockHistory] = _ => ClockHistory.empty.some,
    status: Status,
    daysPerTurn: Option[Days],
    binaryMoveTimes: Option[Array[Byte]] = None,
    rated: Rated = Rated.default,
    bookmarks: Int = 0,
    createdAt: Instant = nowInstant,
    movedAt: Instant = nowInstant,
    metadata: GameMetadata,
    abortedBy: Option[Color] = None,
    // A byo-yomi clock (ADR 0020 §7, unit 4.7), stored under `cy`. A game has at most one of `clock` (Fischer)
    // and `byoyomi`; code that only knows Fischer clocks reads `clock` and sees none in a byo-yomi game.
    byoyomi: Option[ByoyomiClock] = None,
    // A Go game's scoring phase (ADR 0020 §2, unit 4.8), stored under `sc`: there while the players agree on
    // dead stones, and kept on a game that ended by counting.
    goScoring: Option[GoScoring] = None
):

  export metadata.{ tournamentId, simulId, swissId, drawOffers, source, sgfImport, hasRule }
  export players.{ white as whitePlayer, black as blackPlayer, apply as player }

  /** The game's real-time clock, whichever kind it has. */
  def gameClock: Option[GameClock] =
    clock.map(GameClock.Fischer(_)).orElse(byoyomi.map(GameClock.Byoyomi(_)))

  lazy val clockHistory = gameClock.flatMap(loadClockHistory)

  /** The player to move, as the Go game says (ADR 0019 §3). */
  def turnColor: Color = GoBridge.color(go.toMove)

  /** In the scoring phase (ADR 0020 §3): the clocks are stopped and nobody moves. */
  def inGoScoring: Boolean = goScoring.isDefined && playable

  /** Replace the Go game after an action or a takeback, taking its new ply (placements and passes, not
    * resumes, ADR 0019 §3).
    */
  def withGo(g: GoGame): Game = copy(go = g, ply = startedAtPly + GoBridge.plies(g))

  def player[U: UserIdOf](user: U): Option[Player] = players.find(_.isUser(user))
  def opponentOf[U: UserIdOf](user: U): Option[Player] = player(user).map(opponent)

  def player: Player = players(turnColor)
  def playerById(playerId: GamePlayerId): Option[Player] = players.find(_.id == playerId)

  def hasUserIds(userId1: UserId, userId2: UserId) =
    hasUserId(userId1) && hasUserId(userId2)

  def hasUserId(userId: UserId) = players.exists(_.userId.has(userId))

  def userIdPair: ByColor[Option[UserId]] = players.map(_.userId)

  def opponent(p: Player): Player = opponent(p.color)
  def opponent(c: Color): Player = player(!c)

  lazy val naturalOrientation = Color.fromWhite(players.reduce(_.before(_)))

  def turnOf(p: Player): Boolean = p == player
  def turnOf(c: Color): Boolean = c == turnColor
  def turnOf(u: User): Boolean = player(u).exists(turnOf)

  def playedPlies: Ply = ply - startedAtPly

  def flagged = (status == Status.Outoftime).option(turnColor)

  def fullIdOf(player: Player): Option[GameFullId] =
    players.contains(player).option(GameFullId(s"$id${player.id}"))

  def fullIdOf(color: Color) = GameFullId(s"$id${player(color).id}")

  def fullIds: ByColor[GameFullId] = ByColor(fullIdOf)

  export tournamentId.isDefined as isTournament
  export simulId.isDefined as isSimul
  export swissId.isDefined as isSwiss
  def isMandatory = isTournament || isSimul || isSwiss
  def nonMandatory = !isMandatory
  def canTakebackOrAddTime = !isMandatory

  // we can't rely on the clock,
  // because if moretime was given,
  // elapsed time is no longer representing the game duration
  def durationSeconds: Option[Int] =
    val seconds = movedAt.toSeconds - createdAt.toSeconds
    (seconds < 60 * 60 * 12).option( // no way it lasted more than 12 hours, come on.
      seconds.toInt
    )

  def bothClockStates: Option[Vector[Centis]] = clockHistory.map(_.bothClockStates(startColor))

  def updatePlayer(color: Color, f: Player => Player) =
    copy(players = players.update(color, f))

  def start =
    if started then this
    else
      copy(
        status = Status.Started,
        rated = rated.map(_ && userIds.distinct.size == 2)
      )

  def correspondenceClock: Option[CorrespondenceClock] =
    daysPerTurn.map(d => CorrespondenceClock(d.value, turnColor, movedAt))

  def playableCorrespondenceClock: Option[CorrespondenceClock] =
    if playable then correspondenceClock else none

  def perfKey: PerfKey = GoBridge.perfKey

  def started = status >= Status.Started

  def aborted = status == Status.Aborted

  def abort = copy(status = Status.Aborted)

  def playable = status < Status.Aborted && !sourceIs(_.Import)

  def aiLevel: Option[Int] = players.find(_.aiLevel)

  def hasAi: Boolean = players.exists(_.isAi)
  def nonAi = !hasAi

  def synthetic = id == GameId("synthetic")

  def aiPov: Option[Pov] = players.findColor(_.isAi).map(pov)

  def swissPreventsDraw = isSwiss && playedPlies < 60
  def rulePreventsDraw = hasRule(_.noEarlyDraw) && playedPlies < 60

  def boosted = rated.yes && finished && bothPlayersHaveMoved && playedPlies < 10

  def abortable = status == Status.Started && playedPlies < 2 && nonMandatory
  def abortableByUser = abortable && !hasRule(_.noAbort)

  def berserkable =
    isTournament && clock.exists(_.config.berserkable) && status == Status.Started && playedPlies < 2

  def resignable = playable && !abortable
  def forceResignable =
    resignable && nonAi && hasClock && !isSwiss && !hasRule(_.noClaimWin)
  def forceResignableNow = forceResignable && bothPlayersHaveMoved
  // Go has no draws (ADR 0019 §6): no offers, claims or forced draws.
  def drawable = false

  def finished = status >= Status.Mate

  def finishedOrAborted = finished || aborted

  def replayable = isSgfImport || finished || (aborted && bothPlayersHaveMoved)

  def fromPosition = source.has(Source.Position)

  def sourceIs(f: Source.type => Source): Boolean = source contains f(Source)
  def lobbyOrPool = source.exists(s => s == Source.Lobby || s == Source.Pool)

  def winner: Option[Player] = players.find(_.isWinner | false)

  def loser: Option[Player] = winner.map(opponent)

  def winnerColor: Option[Color] = winner.map(_.color)
  def outcome: Option[Outcome] = finished.option(Outcome(winnerColor))

  /** A game that ended without a count (ADR 0020 §4): no result, not a draw (a counted tie is `Draw`). */
  def endedWithNoResult: Boolean = status == Status.UnknownFinish && winnerColor.isEmpty

  def winnerUserId: Option[UserId] = winner.flatMap(_.userId)

  def loserUserId: Option[UserId] = loser.flatMap(_.userId)

  def wonBy(c: Color): Option[Boolean] = winner.map(_.color == c)

  def drawn = finished && winner.isEmpty

  // Nobody runs out of time while the players agree on dead stones (ADR 0020 §3): the clocks are stopped,
  // and a stopped clock with time used would otherwise read as flagged.
  def outoftime(withGrace: Boolean): Boolean =
    if inGoScoring then false
    else if isCorrespondence then outoftimeCorrespondence
    else outoftimeClock(withGrace)

  private def outoftimeClock(withGrace: Boolean): Boolean =
    gameClock.exists: c =>
      started && playable && {
        c.outOfTime(turnColor, withGrace) || {
          !c.isRunning && c.anyTimeUsed
        }
      }

  private def outoftimeCorrespondence: Boolean =
    playableCorrespondenceClock.exists(_.outoftime(turnColor))

  def isCorrespondence = speed == Speed.Correspondence
  def isSpeed(s: Speed) = speed == s

  def hasClock = gameClock.isDefined
  // Fischer settings only: a byo-yomi game has none (its settings are `byoyomi.map(_.config)`).
  def clockConfig = clock.map(_.config)
  def speed = byoyomi.fold(Speed(clockConfig))(c => GameClock.Byoyomi(c).speed)

  def hasCorrespondenceClock = daysPerTurn.isDefined

  def isUnlimited = !hasClock && !hasCorrespondenceClock

  def playerWhoDidNotMove: Option[Player] = {
    if playedPlies == Ply.initial then player(startColor).some
    else if playedPlies == Ply.initial.next then player(!startColor).some
    else none
  }.filterNot(winner.contains)

  def bothPlayersHaveMoved = playedPlies > 1

  def startColor = startedAtPly.turn

  def playerMoves(color: Color): Int =
    if color == startColor
    then (playedPlies.value + 1) / 2
    else playedPlies.value / 2

  def playerHasMoved(color: Color) = playerMoves(color) > 0

  def isBeingPlayed = !isSgfImport && !finishedOrAborted

  def userIds: List[UserId] = players.flatMap(_.userId)

  def twoUserIds: Option[PairOf[UserId]] = for
    w <- whitePlayer.userId
    b <- blackPlayer.userId
    if w != b
  yield w -> b

  def averageUsersRating: Option[IntRating] = players.flatMap(_.rating) match
    case a :: b :: Nil => Some((a + b).map(_ / 2))
    case a :: Nil => Some((a + IntRating(1500)).map(_ / 2))
    case _ => None

  def isStrongOrRecent = averageUsersRating.exists(_.value >= 2200) ||
    createdAt.isAfter(nowInstant.minus(10.days))

  def isSgfImport = sgfImport.isDefined

  def hasFewerMovesThanExpected = playedPlies <= reasonableMinimumNumberOfMoves

  def pov(c: Color) = Pov(this, c)
  def povs: ByColor[Pov] = ByColor(pov)

  override def toString = s"""Game($id)"""
end Game
