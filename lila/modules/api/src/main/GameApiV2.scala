package lila.api

import org.apache.pekko.stream.scaladsl.*
import chess.ByColor
import play.api.libs.json.*
import reactivemongo.pekkostream.cursorProducer

import lila.common.HTTPRequest
import lila.common.Json.given
import lila.core.LightUser
import lila.core.game.GoBridge
import lila.db.dsl.{ *, given }
import lila.game.JsonView.given
import lila.game.GameExport.{ WithFlags, applyDelay }
import lila.game.{ Query, SgfDump }
import lila.round.GameProxyRepo

final class GameApiV2(
    gameRepo: lila.game.GameRepo,
    gameCache: lila.game.Cached,
    gameJsonView: lila.game.JsonView,
    getLightUser: LightUser.Getter,
    gameProxy: GameProxyRepo,
    baseUrl: lila.core.config.BaseUrl,
    bookmarkApi: lila.bookmark.BookmarkApi,
    crosstableApi: lila.game.CrosstableApi
)(using Executor, org.apache.pekko.actor.ActorSystem):

  import GameApiV2.*

  def exportOne(game: Game, config: OneConfig): Fu[String] =
    config.format match
      case Format.SGF => sgfOf(game, config.flags).map(_ | "")
      case Format.JSON => toJson(game, config).map(Json.stringify)

  private val fileR = """[\s,]""".r

  def filename(game: Game, format: Format): Fu[String] =
    if format == Format.SGF then fuccess(s"ligo_${game.id}.sgf") // unit 4.11
    else jsonFilename(game, format)

  private def jsonFilename(game: Game, format: Format): Fu[String] =
    gameLightUsers(game).map: users =>
      fileR.replaceAllIn(
        "ligo_%s_%s_vs_%s.%s.%s".format(
          dateFormat.print(game.createdAt),
          playerName.tupled(users.white),
          playerName.tupled(users.black),
          game.id,
          format.toString.toLowerCase
        ),
        "_"
      )

  // filename(tour, ...) and filename(swiss, ...) were removed with the tournament and swiss
  // modules (unit 3.2).

  def exportByUser(config: ByUserConfig): Source[String, ?] =
    val playerSelect =
      if config.finished then config.vs.fold(Query.user(config.user.id)) { Query.opponents(config.user, _) }
      else
        config.vs
          .map(_.id)
          .fold(Query.nowPlaying(config.user.id)):
            Query.nowPlayingVs(config.user.id, _)
    // Game search (Elasticsearch) went with unit 3.7: the rated and analysed filters now run in
    // Mongo, and the perf and colour filters on the games read (neither is a stored field).
    val gameSource: Source[Game, ?] =
      gameRepo
        .sortedCursor(
          playerSelect ++
            Query.createdBetween(config.since, config.until) ++
            (!config.ongoing).so(Query.finished) ++
            config.rated.so(r => if r then Query.rated else Query.casual) ++
            config.analysed.so(Query.analysed),
          config.sort.bson,
          batchSize = config.perSecond.value
        )
        .documentSource()
        .filter: g =>
          (config.perfKey.isEmpty || config.perfKey(g.perfKey)) &&
            config.color.forall(c => g.player(c).userId.contains(config.user.id))
        .take(config.max.fold(Int.MaxValue)(_.value))

    gameSource
      .via(upgradeOngoingGame)
      .via(preparationFlow(config))

  def mobileRecent(user: User)(using Option[Me]): Fu[JsArray] = for
    games <- gameRepo.recentFinishedGamesFromSecondary(user, Max(10))
    config = MobileRecentConfig(user)
    jsons <- games.sequentially(toJson(_, config))
  yield JsArray(jsons)

  def mobileCurrent(user: User)(using Option[Me]): Fu[Option[JsObject]] =
    gameCache
      .lastPlayedPlayingId(user.id)
      .flatMapz(gameProxy.gameIfPresentOrFetch)
      .flatMapz: game =>
        val config = OneConfig(GameApiV2.Format.JSON, WithFlags())
        toJson(game, config).dmap(some)

  def exportByIds(config: ByIdsConfig): Source[String, ?] =
    gameRepo
      .sortedCursor(
        inIds(config.ids),
        Query.sortCreated,
        hint = bid(1).some,
        batchSize = config.perSecond.value
      )
      .documentSource()
      .via(upgradeOngoingGame)
      .via(preparationFlow(config))

  // exportByTournament and exportBySwiss were removed with the tournament and swiss modules
  // (unit 3.2); they backed the now-deleted Api.tournamentGames/swissGames endpoints.

  def exportUserImportedGames(config: ImportedConfig): Source[String, ?] =
    val games = gameRepo
      .sortedCursor(Query.imported(config.user), Query.importedSort, batchSize = config.perSecond.value)
      .documentSource()
    // an import's SGF export is the text as it was sent (`sgfOf`)
    games.via(preparationFlow(config))

  def exportUserBookmarks(config: BookmarkConfig): Source[String, ?] =
    import lila.game.BSONHandlers.gameHandler
    bookmarkApi.coll
      .aggregateWith[Game](readPreference = ReadPref.sec): framework =>
        import framework.*
        List(
          Match(bookmarkApi.userIdQuery(config.user) ++ dateBetween("d", config.since, config.until)),
          Sort(if config.sort == GameSort.DateDesc then Descending("d") else Ascending("d")),
          Limit(config.max.fold(5000)(_.value)),
          PipelineOperator(lookup.simple(gameRepo.coll, "game", "g", "_id")),
          Unwind("game"),
          ReplaceRootField("game"),
          Match(Query.go) // a chess game stored before unit 3.17 is not read
        )
      .documentSource()
      .via(preparationFlow(config))

  def crosstableWith(user: User)(me: Me): Fu[JsObject] =
    crosstableApi.withMatchup(me.userId, user.id).map(Json.toJsObject)

  private val upgradeOngoingGame =
    Flow[Game].mapAsync(4)(gameProxy.upgradeIfPresent)

  private def preparationFlow(config: Config) =
    Flow[Game]
      .throttle(config.perSecond.value, 1.second)
      .mapAsync(4): game =>
        // a Go game has no chess opening (unit 3.16); no engine analysis (unit 3.17, slice b)
        def json = toJson(game, config).map: json =>
          s"${Json.stringify(json)}\n"
        config.format match
          case Format.SGF =>
            sgfOf(game, config.flags).flatMap:
              case Some(sgf) => fuccess(s"$sgf\n\n")
              case None => json
          case Format.JSON => json

  // Unit 4.11: a Go game as SGF, with the same move delay and `moves` flag as the JSON export.
  private def sgfOf(game: Game, flags: WithFlags): Fu[Option[String]] =
    storedSgf(game).fold(replayedSgf(game, flags))(sgf => fuccess(sgf.some))

  private def replayedSgf(game: Game, flags: WithFlags): Fu[Option[String]] =
    gameLightUsers(game).map: users =>
      val names = users.map((p, u) => SgfDump.playerName(p, u))
      SgfDump(game, names, s"LiGo $baseUrl/${game.id}", flags)

  private def toJson(
      g: Game,
      config: Config
  ): Fu[JsObject] = for
    lightUsers <- gameLightUsers(g)
    flags = config.flags
    bookmarked <- config.flags.bookmark.so(bookmarkApi.exists(g, config.by.map(_.userId)))
  // g.tournamentId is a neutral field kept in game storage (unit 3.2); no tournament feature
  // exists any more to name it, so "arenaTour" is never populated for new games.
  yield Json
    .obj(
      "id" -> g.id,
      "rated" -> g.rated,
      "speed" -> g.speed.key,
      "perf" -> g.perfKey,
      "createdAt" -> g.createdAt,
      "lastMoveAt" -> g.movedAt,
      "status" -> g.status.name,
      "source" -> g.source,
      "players" -> JsObject(lightUsers.mapList: (p, user) =>
        p.color.name -> gameJsonView.player(p, user))
    )
    // A Go game carries its setup (size, rules, komi, handicap, position) instead of a chess variant and
    // initial FEN, and its moves as SGF points and `pass` (unit 3.16).
    .add("go" -> lila.game.JsonView.goSetup(g.go).some)
    .add("fullId" -> config.by.flatMap(Pov(g, _)).map(_.fullId))
    .add("winner" -> g.winnerColor.map(_.name))
    .add("moves" -> flags.moves.option {
      val moves = lila.game.JsonView.goMoves(g.go)
      applyDelay(moves, flags.keepDelayIf(g.playable)).mkString(" ")
    })
    .add("clocks" -> flags.clocks.so(g.bothClockStates).map { clocks =>
      applyDelay(clocks, flags.keepDelayIf(g.playable))
    })
    .add("daysPerTurn" -> g.daysPerTurn)
    .add("arenaTour" -> g.tournamentId.map(id => Json.obj("id" -> id)))
    .add("swissTour" -> g.swissId.map(id => Json.obj("id" -> id)))
    .add("clock" -> g.clock.map: clock =>
      Json.obj(
        "initial" -> clock.limitSeconds,
        "increment" -> clock.incrementSeconds,
        "totalTime" -> clock.estimateTotalSeconds
      ))
    .add("lastMove" -> flags.lastFen.option(g.go.actions.lastOption.map(GoBridge.token)))
    // the game's position, as live mini boards receive it (ADR 0019 §6)
    .add("lastBoard" -> flags.lastFen.option(GoBridge.board(g.go)))
    .add("bookmarked" -> bookmarked)
    .add("import" -> g.sgfImport.map: i =>
      Json.obj().add("date" -> i.date))

  private def gameLightUsers(game: Game): Future[ByColor[(lila.core.game.Player, Option[LightUser])]] =
    game.players.traverse(_.userId.so(getLightUser)).dmap(game.players.zip(_))

object GameApiV2:

  /** An imported game exports as the SGF text it was stored with, verbatim (unit 7.5, ADR 0023 §2): the
    * original, with its variations and comments. Other games are written from their moves.
    */
  def storedSgf(game: Game): Option[String] = game.sgfImport.map(_.sgf)

  // Game exports are JSON (or NDJSON) since PGN went with chess games (unit 3.17), or SGF (unit 4.11).
  enum Format:
    case JSON, SGF
  object Format:
    /** SGF with `Accept: application/x-go-sgf` or `?format=sgf`, else JSON (or NDJSON). */
    def byRequest(using req: play.api.mvc.RequestHeader): Format =
      if HTTPRequest.acceptsSgf(req) || HTTPRequest.queryStringGet("format").contains("sgf") then SGF
      else JSON

  private val dateFormat =
    java.time.format.DateTimeFormatter.ofPattern("yyyy.MM.dd").withZone(java.time.ZoneOffset.UTC)

  private def playerName(p: lila.core.game.Player, u: Option[LightUser]): String =
    u.fold(p.name.fold(UserName.anonymous.value)(_.value))(_.name.value)

  sealed trait Config:
    val format: Format
    val flags: WithFlags
    val by: Option[Me]
    val perSecond: MaxPerSecond

  enum GameSort(val bson: Bdoc):
    case DateAsc extends GameSort(Query.sortChronological)
    case DateDesc extends GameSort(Query.sortAntiChronological)

  case class OneConfig(
      format: Format,
      flags: WithFlags
  )(using val by: Option[Me])
      extends Config:
    val perSecond = MaxPerSecond(1)

  case class ByUserConfig(
      user: User,
      vs: Option[User],
      format: Format,
      since: Option[Instant] = None,
      until: Option[Instant] = None,
      max: Option[Max] = None,
      rated: Option[Boolean] = None,
      perfKey: Set[PerfKey],
      analysed: Option[Boolean] = None,
      color: Option[Color],
      flags: WithFlags,
      sort: GameSort,
      perSecond: MaxPerSecond,
      ongoing: Boolean = false,
      finished: Boolean = true
  )(using val by: Option[Me])
      extends Config

  case class ByIdsConfig(
      ids: Seq[GameId],
      format: Format,
      flags: WithFlags,
      perSecond: MaxPerSecond,
      playerFile: Option[String] = None
  )(using val by: Option[Me])
      extends Config

  // ByTournamentConfig and BySwissConfig were removed with the tournament and swiss modules
  // (unit 3.2).

  case class BookmarkConfig(
      user: UserId,
      format: Format,
      since: Option[Instant] = None,
      until: Option[Instant] = None,
      max: Option[Max] = None,
      flags: WithFlags,
      sort: GameSort,
      perSecond: MaxPerSecond
  )(using val by: Option[Me])
      extends Config

  case class ImportedConfig(
      user: UserId,
      flags: WithFlags
  )(using val by: Option[Me])
      extends Config:
    val format = Format.JSON
    val perSecond = MaxPerSecond(20)

  case class MobileRecentConfig(user: User)(using val by: Option[Me]) extends Config:
    val format = GameApiV2.Format.JSON
    val flags =
      WithFlags(
        clocks = false,
        moves = false,
        lastFen = true
      )
    val perSecond = MaxPerSecond(20) // unused
