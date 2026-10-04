package lila.game

import chess.{ ByColor, Clock, Color, Ply, Status }
import reactivemongo.api.bson.*
import scalalib.model.Days

import scala.util.{ Success, Try }

import lila.core.game.{
  ClockHistory,
  Game,
  GameClock,
  GoBridge,
  GameDrawOffers,
  GameMetadata,
  GameRule,
  LightGame,
  LightPlayer,
  PgnImport,
  Source,
  emptyDrawOffers
}
import ligo.gorules.{ ByoyomiClock, ByoyomiConfig, ByoyomiState, Color as GoColor }

import lila.db.BSON
import lila.db.dsl.{ *, given }

object BSONHandlers:

  import lila.db.ByteArray.byteArrayHandler

  given statusHandler: BSONHandler[Status] = tryHandler[Status](
    { case BSONInteger(v) => Status(v).toTry(s"No such status: $v") },
    x => BSONInteger(x.id)
  )

  given BSONHandler[GameRule] = valueMapHandler[String, GameRule](GameRule.byKey)(_.toString)

  /** A byo-yomi clock (ADR 0020 §7, key `cy`): `m` main seconds, `n` periods, `p` period seconds, `t` whose
    * clock it is (`true` for White), `bt`/`wt` each player's time used in centiseconds, `bp`/`wp` their
    * periods used up, and `r` since when it has run (epoch milliseconds), absent when stopped.
    */
  private[game] given byoyomiStateHandler: BSONDocumentHandler[ByoyomiState] with
    def readDocument(doc: BSONDocument) = for
      main <- doc.getAsTry[Int]("m")
      periods <- doc.getAsTry[Int]("n")
      period <- doc.getAsTry[Int]("p")
      white <- doc.getAsTry[Boolean]("t")
      bt <- doc.getAsTry[Int]("bt")
      bp <- doc.getAsTry[Int]("bp")
      wt <- doc.getAsTry[Int]("wt")
      wp <- doc.getAsTry[Int]("wp")
    yield ByoyomiState(
      ByoyomiConfig(main, periods, period),
      if white then GoColor.White else GoColor.Black,
      bt,
      bp,
      wt,
      wp,
      doc.getAsOpt[Long]("r")
    )
    def writeTry(s: ByoyomiState) = Success:
      BSONDocument(
        "m" -> s.config.mainSeconds,
        "n" -> s.config.periods,
        "p" -> s.config.periodSeconds,
        "t" -> (s.toMove == GoColor.White),
        "bt" -> s.blackElapsedCentis,
        "bp" -> s.blackSpentPeriods,
        "wt" -> s.whiteElapsedCentis,
        "wp" -> s.whiteSpentPeriods,
        "r" -> s.runningSince
      )

  given sourceHandler: BSONHandler[Source] = valueMapHandler[Int, Source](Source.byId)(_.id)

  private[game] given gameDrawOffersHandler: BSONHandler[GameDrawOffers] = tryHandler[GameDrawOffers](
    { case arr: BSONArray =>
      Success(arr.values.foldLeft(emptyDrawOffers) {
        case (offers, BSONInteger(p)) =>
          if p > 0 then offers.copy(white = offers.white.incl(Ply(p)))
          else offers.copy(black = offers.black.incl(Ply(-p)))
        case (offers, _) => offers
      })
    },
    offers =>
      BSONArray(
        (Ply.raw(offers.white) ++ Ply.raw(offers.black).map(-_)).view.map(BSONInteger.apply).toIndexedSeq
      )
  )

  given BSONDocumentHandler[PgnImport] = Macros.handler

  given gameHandler: BSON[Game] with
    import lila.game.Game.BSONFields as F

    def reads(r: BSON.Reader): Game =

      lila.mon.game.fetch.increment()

      val playerIds = r.str(F.playerIds)
      val light = lightGameReader.reads(r)

      val storedStartedAtPly = Ply(r.intD(F.startedAtTurn))
      val storedPly = r.get[Ply](F.turns)

      // A game is its Go block (ADR 0019 §4), replayed. Chess documents from before unit 3.17 are not read:
      // game queries skip them (`Query.go`), and one read by id anyway is an error.
      val go = GoStorage.read(r, light.id).fold(e => sys.error(s"Go game ${light.id}: $e"), identity)

      // The starting ply follows from the setup; `st` is only cross-checked.
      val startedAtPly =
        val fromSetup =
          ligo.gorules.GoGame.start(go.setup).fold(_ => storedStartedAtPly, GoBridge.startedAtPly)
        if fromSetup != storedStartedAtPly then
          lila
            .log("game")
            .warn(s"Go game ${light.id}: stored starting ply $storedStartedAtPly, setup gives $fromSetup")
        fromSetup

      // The replay decides; `t` is only cross-checked (`ac` also holds resumes, so its length is not it).
      val ply =
        val replayed = startedAtPly + GoBridge.plies(go)
        if replayed != storedPly then
          lila.log("game").warn(s"Go game ${light.id}: stored ply $storedPly, replayed $replayed")
        replayed
      val turnColor = GoBridge.color(go.toMove)
      val createdAt = r.date(F.createdAt)

      val whitePlayer = Player.from(light, Color.white, playerIds, r.getD[Bdoc](F.whitePlayer))
      val blackPlayer = Player.from(light, Color.black, playerIds, r.getD[Bdoc](F.blackPlayer))

      val clock = r
        .getO[Color => Clock](F.clock)(using
          clockBSONReader(createdAt, whitePlayer.berserk, blackPlayer.berserk)
        )
        .map(_(turnColor))

      val whiteClockHistory = r.bytesO(F.whiteClockHistory)
      val blackClockHistory = r.bytesO(F.blackClockHistory)

      Game(
        id = light.id,
        players = ByColor(whitePlayer, blackPlayer),
        go = go,
        ply = ply,
        startedAtPly = startedAtPly,
        clock = clock,
        loadClockHistory = clk =>
          for
            bw <- whiteClockHistory
            bb <- blackClockHistory
            history <-
              BinaryFormat.clockHistory
                .read(clk.startTime, bw, bb, (light.status == Status.Outoftime).option(turnColor))
            _ = lila.mon.game.loadClockHistory.increment()
          yield history,
        status = light.status,
        daysPerTurn = r.getO[Days](F.daysPerTurn),
        binaryMoveTimes = r.getO[Array[Byte]](F.moveTimes),
        rated = r.yesnoD(F.rated),
        bookmarks = r.intD(F.bookmarks),
        createdAt = createdAt,
        movedAt = r.dateD(F.movedAt, createdAt),
        metadata = GameMetadata(
          source = r.getO[Source](F.source),
          pgnImport = r.getO[PgnImport](F.pgnImport),
          tournamentId = r.getO[TourId](F.tournamentId),
          swissId = r.getO[SwissId](F.swissId),
          simulId = r.getO[SimulId](F.simulId),
          analysed = r.boolD(F.analysed),
          drawOffers = r.getD(F.drawOffers, emptyDrawOffers),
          rules = r.getD(F.rules, Set.empty)
        ),
        abortedBy = r.getO[Color](F.abortedBy),
        byoyomi = r
          .getO[BSONDocument](F.byoyomi)
          .flatMap: doc =>
            // an unreadable clock loads the game without it, logged, rather than failing the whole game
            byoyomiStateHandler
              .readDocument(doc)
              .toEither
              .left
              .map(_.getMessage)
              .flatMap(ByoyomiClock.restore(_))
              .left
              .map(e => lila.log("game").warn(s"Go game ${light.id}: unreadable byo-yomi clock: $e"))
              .toOption,
        goScoring = for
          doc <- r.getO[BSONDocument](GoStorage.F.scoring)
          // an unreadable scoring phase loads the game without it, logged, rather than failing the whole game
          sc <- GoStorage.scoring
            .read(doc, go.size)
            .left
            .map(e => lila.log("game").warn(s"Go game ${light.id}: unreadable scoring phase: $e"))
            .toOption
        yield sc
      )

    def writes(w: BSON.Writer, o: Game) =
      BSONDocument(
        F.id -> o.id,
        F.playerIds -> o.players.reduce(_.id.value + _.id.value),
        F.playerUids -> o.players
          .map(_.userId)
          .toPair
          .match
            case (None, None) => None
            case (Some(w), None) => Some(List(w.value))
            case (wo, Some(b)) => Some(List(wo.so(_.value), b.value))
        ,
        F.whitePlayer -> w.docO(Player.playerWrite(o.whitePlayer)),
        F.blackPlayer -> w.docO(Player.playerWrite(o.blackPlayer)),
        F.status -> o.status,
        F.turns -> o.ply,
        F.startedAtTurn -> w.intO(o.startedAtPly.value),
        F.clock -> o.clock.flatMap { c =>
          clockBSONWrite(o.createdAt, c).toOption
        },
        F.daysPerTurn -> o.daysPerTurn,
        F.moveTimes -> o.binaryMoveTimes,
        F.byoyomi -> o.byoyomi.map(_.state),
        F.whiteClockHistory -> clockHistory(Color.White, o.clockHistory, o.gameClock, o.flagged),
        F.blackClockHistory -> clockHistory(Color.Black, o.clockHistory, o.gameClock, o.flagged),
        F.rated -> w.yesnoO(o.rated),
        F.bookmarks -> w.intO(o.bookmarks),
        F.createdAt -> w.date(o.createdAt),
        F.movedAt -> w.date(o.movedAt),
        F.source -> o.metadata.source,
        F.pgnImport -> o.metadata.pgnImport,
        F.tournamentId -> o.metadata.tournamentId,
        F.swissId -> o.metadata.swissId,
        F.simulId -> o.metadata.simulId,
        F.analysed -> w.boolO(o.metadata.analysed),
        F.rules -> o.metadata.nonEmptyRules,
        F.abortedBy -> o.abortedBy
      ) ++ GoStorage.write(o.go) ++ // a game writes its Go block and none of the chess keys (ADR 0019 §4)
        bdoc(GoStorage.F.scoring -> o.goScoring.map(GoStorage.scoring.write(_, o.go.size)))

  given lightGameReader: lila.db.BSONReadOnly[LightGame] with

    import lila.game.Game.BSONFields as F

    private val emptyPlayerBuilder = lila.game.LightPlayer.builderRead(emptyBdoc)

    def reads(r: BSON.Reader): LightGame =
      val winC = r.boolO(F.winnerColor).map { Color.fromWhite(_) }
      val uids = ~r.getO[List[UserId]](F.playerUids)
      val (whiteUid, blackUid) = (uids.headOption.filter(_.value.nonEmpty), uids.lift(1))
      def makePlayer(field: String, color: Color, uid: Option[UserId]): LightPlayer =
        val builder =
          r.getO[lila.game.LightPlayer.Builder](field)(using
            lila.game.LightPlayer.lightPlayerReader
          ) | emptyPlayerBuilder
        builder(color)(uid)
      LightGame(
        id = r.get[GameId](F.id),
        whitePlayer = makePlayer(F.whitePlayer, Color.White, whiteUid),
        blackPlayer = makePlayer(F.blackPlayer, Color.Black, blackUid),
        status = r.get[Status](F.status),
        win = winC,
        isGo = GoStorage.isGo(r)
      )

  private def clockHistory(
      color: Color,
      clockHistory: Option[ClockHistory],
      clock: Option[GameClock],
      flagged: Option[Color]
  ) =
    for
      clk <- clock
      history <- clockHistory
      times = history(color)
    yield BinaryFormat.clockHistory.writeSide(clk.startTime, times, flagged.has(color))

  private[game] def clockBSONReader(since: Instant, whiteBerserk: Boolean, blackBerserk: Boolean) =
    new BSONReader[Color => Clock]:
      def readTry(bson: BSONValue): Try[Color => Clock] =
        bson match
          case bin: BSONBinary =>
            byteArrayHandler.readTry(bin).map { cl =>
              BinaryFormat.clock(since).read(cl, whiteBerserk, blackBerserk)
            }
          case b => lila.db.BSON.handlerBadType(b)

  private[game] def clockBSONWrite(since: Instant, clock: Clock) =
    byteArrayHandler.writeTry:
      BinaryFormat.clock(since).write(clock)
