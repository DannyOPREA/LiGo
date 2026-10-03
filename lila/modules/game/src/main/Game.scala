package lila.game

import chess.variant.Variant
import chess.{ Centis, Clock, Color, Ply, Speed, Status }
import scalalib.model.Days

import lila.core.game.{ ClockHistory, Game, Player, Pov, Source }
import lila.game.Blurs.addAtMoveIndex
import lila.rating.PerfType

object GameExt:

  def computeMoveTimes(g: Game, color: Color): Option[List[Centis]] = {
    for
      clk <- g.clock
      inc = clk.incrementOf(color)
      history <- g.clockHistory
      clocks = history(color)
    yield Centis(0) :: {
      val pairs = clocks.iterator.zip(clocks.iterator.drop(1))

      // We need to determine if this color's last clock had inc applied.
      // if finished and history.size == playedTurns then game was ended
      // by a players move, such as with mate or autodraw. In this case,
      // the last move of the game, and the only one without inc, is the
      // last entry of the clock history for !turnColor.
      //
      // On the other hand, if history.size is more than playedTurns,
      // then the game ended during a players turn by async event, and
      // the last recorded time is in the history for turnColor.
      val clocksRecorded = history.mapReduce(_.size)(_ + _)
      val noLastInc = g.finished && (g.playedPlies >= clocksRecorded) == (color != g.turnColor)

      pairs
        .map: (first, second) =>
          {
            val d = first - second
            if pairs.hasNext || !noLastInc then d + inc else d
          }.nonNeg
        .toList
    }
  }.orElse(g.binaryMoveTimes.map: binary =>
    // TODO: make movetime.read return List after writes are disabled.
    val base = BinaryFormat.moveTime.read(binary, g.playedPlies)
    val mts = if color == g.startColor then base else base.drop(1)
    everyOther(mts.toList))

  def analysable(g: Game) =
    g.replayable && g.playedPlies > 4 &&
      Game.analysableVariants(g.variant) &&
      !Game.isOldHorde(g)

  extension (clockHistory: ClockHistory)

    def recordNewClock(color: Color, clock: Clock) =
      clockHistory.update(color, _ :+ clock.remainingTime(color))

    def resetClockHistory(color: Color) = clockHistory.update(color, _ => Vector.empty)

  extension (g: Game)

    def playerIdPov(playerId: GamePlayerId): Option[Pov] = g.playerById(playerId).map(p => Pov(g, p.color))

    def withClock(c: Clock) = Progress(g, g.copy(clock = Some(c)))

    def startClock: Option[Progress] =
      g.clock.map: c =>
        g.start.withClock(c.start)

    def playerHasOfferedDrawRecently(color: Color) =
      g.drawOffers.lastBy(color).exists(_ >= g.ply - 20)

    def playerCanOfferDraw(color: Color) =
      g.started && g.playable &&
        g.ply >= 2 &&
        !g.player(color).isOfferingDraw &&
        !g.opponent(color).isAi &&
        !g.playerHasOfferedDrawRecently(color) &&
        !g.swissPreventsDraw &&
        !g.rulePreventsDraw

    def goBerserk(color: Color): Option[Progress] =
      g.clock
        .ifTrue(g.berserkable && !g.player(color).berserk)
        .map: c =>
          val newClock = c.goBerserk(color)
          Progress(
            g,
            g.copy(
              clock = Some(newClock),
              loadClockHistory = _ =>
                g.clockHistory.map: history =>
                  if history(color).isEmpty then history
                  else history.resetClockHistory(color).recordNewClock(color, newClock)
            ).updatePlayer(color, _.copy(berserk = true))
          ) ++
            List(
              Event.ClockInc(color, -c.config.berserkPenalty, newClock),
              Event.Clock(newClock), // BC
              Event.Berserk(color)
            )

    def setBlindfold(color: Color, blindfold: Boolean): Progress =
      Progress(g, g.updatePlayer(color, _.copy(blindfold = blindfold)), Nil)

    def moveTimes: Option[Vector[Centis]] = for
      a <- GameExt.computeMoveTimes(g, g.startColor)
      b <- GameExt.computeMoveTimes(g, !g.startColor)
    yield lila.core.game.interleave(a, b)

    /** The Fischer clock after a Go move (ADR 0019 §5), as scalachess' `Game.applyClock` steps it after a
      * chess move: the frame lag, a step (which switches the running side), and the clock started once each
      * side has played.
      */
    def stepGoClock(
        metrics: chess.MoveMetrics,
        gameActive: Boolean
    ): Option[Clock.WithCompensatedLag[Clock]] =
      g.clock.map: prev =>
        val c1 = metrics.frameLag.fold(prev)(prev.withFrameLag)
        val c2 = c1.step(metrics, gameActive)
        if g.playedPlies == Ply(1) then c2.map(_.start) else c2

    /** A Phase 3 Go game is over once play stops (ADR 0019 §7): the second consecutive pass, or the ply cap.
      */
    def goPlayEnds: Boolean =
      g.go.phase == ligo.gorules.Phase.Scoring ||
        g.playedPlies.value >= lila.core.game.GoBridge.maxPlies

    /** Apply a Go action already accepted by the rules (`next`), with the clock stepped for it (ADR 0019 §5):
      * the Go game, ply, clock and its history, move times and blurs, and the move event.
      */
    def applyGoMove(
        next: ligo.gorules.GoGame,
        clock: Option[Clock],
        blur: Boolean = false
    ): Progress =
      val before = g.go
      val mover = g.turnColor
      def copyPlayer(player: Player) =
        if blur && mover == player.color then
          player.copy(blurs = player.blurs.addAtMoveIndex(g.playerMoves(player.color)))
        else player
      // computed eagerly: it depends on the current time
      val newClockHistory = for
        clk <- clock
        ch <- g.clockHistory
      yield ch.recordNewClock(mover, clk)
      val updated = g
        .withGo(next)
        .copy(
          clock = clock,
          players = g.players.map(copyPlayer),
          binaryMoveTimes = (!g.sourceIs(_.Import) && g.clock.isEmpty).option {
            BinaryFormat.moveTime.write {
              g.binaryMoveTimes.so { t =>
                BinaryFormat.moveTime.read(t, g.playedPlies)
              } :+ Centis.ofLong(nowCentis - g.movedAt.toCentis).nonNeg
            }
          },
          loadClockHistory = _ => newClockHistory,
          movedAt = nowInstant
        )
      val clockEvent = updated.clock
        .map(Event.Clock.apply)
        .orElse(updated.playableCorrespondenceClock.map(Event.CorrespondenceClock.apply))
      val state = Event.State(updated.ply, None, None, whiteOffersDraw = false, blackOffersDraw = false)
      val action = next.actions.lastOption.getOrElse(ligo.gorules.Action.Pass)
      val captured = lila.core.game.GoBridge.captured(before, next)
      Progress(g, updated, List(Event.GoMove(action, mover, captured, next, state, clockEvent)))

    def finish(status: Status, winner: Option[Color]): Game =
      g.copy(
        status = status,
        players = winner.fold(g.players): c =>
          g.players.update(c, _.copy(isWinner = true.some)),
        clock = g.clock.map(_.stop),
        loadClockHistory = clk =>
          g.clockHistory.map: history =>
            // If not already finished, we're ending due to an event
            // in the middle of a turn, such as resignation or draw
            // acceptance. In these cases, record a final clock time
            // for the active color. This ensures the end time in
            // clockHistory always matches the final clock time on
            // the board.
            if !g.finished then history.recordNewClock(g.turnColor, clk)
            else history
      )

    def abandoned = (g.status <= Status.Started) && (g.movedAt.isBefore(Game.abandonedDate))

    def playerBlurPercent(color: Color): Int =
      if g.playedPlies > 5
      then (g.player(color).blurs.nb * 100) / g.playerMoves(color)
      else 0

    def perfType: PerfType = PerfType(g.perfKey)

    def timeForFirstMove: Centis =
      Centis.ofSeconds:
        import chess.Speed.*
        val base =
          if g.isTournament then
            g.speed match
              case UltraBullet => 11
              case Bullet => 16
              case Blitz => 21
              case Rapid => 25
              case _ => 30
          else
            g.speed match
              case UltraBullet => 15
              case Bullet => 20
              case Blitz => 25
              case Rapid => 30
              case _ => 35
        base

    def expirable =
      !g.bothPlayersHaveMoved &&
        g.source.exists(Source.expirable.contains) &&
        g.playable &&
        g.nonAi &&
        g.clock.exists(!_.isRunning)

  end extension

  private def everyOther[A](l: List[A]): List[A] =
    l match
      case a :: _ :: tail => a :: everyOther(tail)
      case _ => l

end GameExt

object Game:

  val syntheticId = GameId("synthetic")

  val analysableVariants: Set[Variant] = Set(
    chess.variant.Standard,
    chess.variant.Crazyhouse,
    chess.variant.Chess960,
    chess.variant.KingOfTheHill,
    chess.variant.ThreeCheck,
    chess.variant.Antichess,
    chess.variant.FromPosition,
    chess.variant.Horde,
    chess.variant.Atomic,
    chess.variant.RacingKings
  )

  val unanalysableVariants: Set[Variant] = Variant.list.all.toSet -- analysableVariants

  private val hordeWhitePawnsSince = instantOf(2015, 4, 11, 10, 0)
  def isOldHorde(game: Game) =
    game.variant == chess.variant.Horde && game.createdAt.isBefore(Game.hordeWhitePawnsSince)

  val abandonedDays = Days(21)
  def abandonedDate = nowInstant.minusDays(abandonedDays.value)

  def isBoardCompatible(game: Game): Boolean =
    game.clockConfig.forall: c =>
      lila.core.game.isBoardCompatible(c) || {
        (game.hasAi || game.sourceIs(_.Friend) || game.sourceIs(_.Api)) &&
        chess.Speed(c) >= Speed.Blitz
      }

  // if source is Arena, we will also need to check if the arena accepts bots!
  def isBotCompatible(game: Game): Option[Boolean] =
    if !game.clockConfig.forall(lila.core.game.isBotCompatible) then false.some
    else if game.hasAi || game.sourceIs(_.Friend) || game.sourceIs(_.Api) then true.some
    else if game.sourceIs(_.Arena) then none
    else false.some

  object BSONFields:
    export lila.core.game.BSONFields.*
    val whitePlayer = "p0"
    val blackPlayer = "p1"
    val playerIds = "is"
    val status = "s"
    val startedAtTurn = "st"
    val clock = "c"
    val daysPerTurn = "cd"
    val moveTimes = "mt"
    val whiteClockHistory = "cw"
    val blackClockHistory = "cb"
    val rated = "ra"
    val variant = "v"
    val bookmarks = "bm"
    val source = "so"
    val tournamentId = "tid"
    val swissId = "iid"
    val simulId = "sid"
    val tvAt = "tv"
    val winnerColor = "w"
    val initialFen = "if"
    val checkAt = "ck"
    val drawOffers = "do"
    val rules = "rules"
    val abortedBy = "ab"
