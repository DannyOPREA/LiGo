package lila.puzzle

import chess.Ply
import play.api.libs.json.*

import lila.common.Json.given
import lila.core.LightUser

final private class GameJson(
    gameRepo: lila.core.game.GameRepo,
    cacheApi: lila.memo.CacheApi,
    lightUserApi: lila.core.user.LightUserApi
)(using Executor, lila.core.i18n.Translator):

  given play.api.i18n.Lang = lila.core.i18n.defaultLang

  def apply(gameId: GameId, plies: Ply, bc: Boolean): Fu[JsObject] =
    (if bc then bcCache else cache).get(writeKey(gameId, plies))

  def noCache(game: Game, plies: Ply): Fu[JsObject] =
    lightUserApi.preloadMany(game.userIds).inject(generate(game, plies))

  def noCacheBc(game: Game, plies: Ply): Fu[JsObject] =
    lightUserApi.preloadMany(game.userIds).inject(generateBc(game, plies))

  private def readKey(k: String): (GameId, Ply) =
    k.drop(GameId.size).toIntOption match
      case Some(ply) => (GameId.take(k), Ply(ply))
      case _ => sys.error(s"puzzle.GameJson invalid key: $k")
  private def writeKey(id: GameId, ply: Ply) = s"$id$ply"

  private val cache = cacheApi[String, JsObject](4096, "puzzle.gameJson"):
    _.expireAfterAccess(5.minutes)
      .maximumSize(4096)
      .buildAsyncFuture: key =>
        val (id, plies) = readKey(key)
        generate(id, plies, false)

  private val bcCache = cacheApi[String, JsObject](1024, "puzzle.bc.gameJson"):
    _.expireAfterAccess(5.minutes)
      .maximumSize(1024)
      .buildAsyncFuture: key =>
        val (id, plies) = readKey(key)
        generate(id, plies, true)

  private def generate(gameId: GameId, plies: Ply, bc: Boolean): Fu[JsObject] =
    gameRepo.gameFromSecondary(gameId).orFail(s"Missing puzzle game $gameId!").flatMap { game =>
      lightUserApi
        .preloadMany(game.userIds)
        .inject:
          if bc then generateBc(game, plies)
          else generate(game, plies)
    }

  private def generate(game: Game, plies: Ply): JsObject =
    Json
      .obj(
        "id" -> game.id,
        "perf" -> perfJson(game),
        "rated" -> game.rated,
        "players" -> playersJson(game),
        // the game's first moves as SGF points and `pass` (unit 3.17: the chess game is gone)
        "pgn" -> game.go.actions.take(plies.value + 1).map(lila.core.game.GoBridge.token).mkString(" ")
      )
      .add("clock", game.clock.map(_.config.show))

  private def perfJson(game: Game) =
    Json.obj(
      "key" -> game.perfKey,
      "name" -> lila.rating.PerfType(game.perfKey).trans
    )

  private def playersJson(game: Game) = JsArray(game.players.mapList: p =>
    val user = p.userId.fold(LightUser.ghost)(lightUserApi.syncFallback)
    Json.toJsObject(user) ++
      Json
        .obj("color" -> p.color.name)
        .add("rating" -> p.rating))

  private def generateBc(game: Game, @annotation.unused plies: Ply): JsObject =
    Json
      .obj(
        "id" -> game.id,
        "perf" -> perfJson(game),
        "players" -> playersJson(game),
        "rated" -> game.rated
      )
      .add("clock", game.clock.map(_.config.show))
