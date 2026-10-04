package lila.game

import org.apache.pekko.actor.*
import org.apache.pekko.stream.Materializer
import com.softwaremill.macwire.*
import com.softwaremill.tagging.*
import play.api.Configuration

import lila.common.autoconfig.{ *, given }
import lila.core.config.*

final private class GameConfig(
    @ConfigName("collection.game") val gameColl: CollName,
    @ConfigName("collection.crosstable") val crosstableColl: CollName,
    @ConfigName("collection.matchup") val matchupColl: CollName
)

@Module
final class Env(
    appConfig: Configuration,
    db: lila.db.Db,
    yoloDb: lila.db.AsyncDb @@ lila.db.YoloDb,
    userApi: lila.core.user.UserApi,
    mongoCache: lila.memo.MongoCache.Api,
    lightUserApi: lila.core.user.LightUserApi,
    cacheApi: lila.memo.CacheApi
)(using scheduler: Scheduler)(using Executor, Materializer):
  private val config = appConfig.get[GameConfig]("game")(using AutoConfig.loader)

  val gameRepo = GameRepo(db(config.gameColl))

  given idGenerator: IdGenerator = wire[IdGenerator]

  val cached: Cached = wire[Cached]

  lazy val paginator = wire[PaginatorBuilder]

  lazy val crosstableApi = new CrosstableApi(
    coll = db(config.crosstableColl),
    matchupColl = yoloDb(config.matchupColl).failingSilently()
  )

  lazy val gamesByUsersStream = wire[GamesByUsersStream]
  lazy val gamesByIdsStream = wire[GamesByIdsStream]

  lazy val favoriteOpponents = wire[FavoriteOpponents]

  lazy val rematches = wire[Rematches]

  lazy val importer = wire[lila.game.importer.Importer]

  lazy val jsonView = wire[JsonView]

  lazy val userGameApi = UserGameApi(lightUserApi)

  lazy val api: lila.core.game.GameApi = new:
    export gameRepo.{ incBookmarks, getSourceAndUserIds }
    override def nbPlaying(userId: UserId): Fu[Int] = cached.nbPlaying(userId)
    export GameExt.{ computeMoveTimes, analysable }
    export AnonCookie.json as anonCookieJson

  given newPlayer: lila.core.game.NewPlayer = new:
    export Player.make as apply
    override def anon(color: Color, aiLevel: Option[Int] = None) =
      Player.makeAnon(color, aiLevel)

  val namer: lila.core.game.Namer = Namer
