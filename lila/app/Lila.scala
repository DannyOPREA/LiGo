package lila.app

import org.apache.pekko.actor.ActorSystem
import com.softwaremill.macwire.*
import play.api.inject.DefaultApplicationLifecycle
import play.api.http.{ FileMimeTypes, HttpRequestHandler }
import play.api.inject.ApplicationLifecycle
import play.api.libs.crypto.DefaultCookieSigner
import play.api.libs.ws.StandaloneWSClient
import play.api.mvc.*
import play.api.mvc.request.*
import play.api.routing.Router
import play.api.{ BuiltInComponents, Configuration, Environment }

// The program entry point.
// To run with bloop:
// /path/to/bloop run lila -m lila.app.Lila -c /path/to/lila/.bloop
object Lila:

  def main(args: Array[String]): Unit =
    lila.web.PlayServer.start(args): env =>
      LilaComponents(
        env,
        DefaultApplicationLifecycle(),
        Configuration.load(env)
      ).application

final class LilaComponents(
    val environment: Environment,
    val applicationLifecycle: ApplicationLifecycle,
    val configuration: Configuration
) extends BuiltInComponents:

  val controllerComponents: ControllerComponents = DefaultControllerComponents(
    defaultActionBuilder,
    playBodyParsers,
    fileMimeTypes,
    executionContext
  )

  given executor: Executor = scala.concurrent.ExecutionContextOpportunistic

  lila.log.system.info:
    val appVersionCommit = ~configuration.getOptional[String]("app.version.commit")
    val appVersionDate = ~configuration.getOptional[String]("app.version.date")
    s"lila version: $appVersionCommit $appVersionDate"

  import _root_.controllers.*

  // we want to use the legacy session cookie baker
  // for compatibility with lila-ws
  lazy val cookieBaker = LegacySessionCookieBaker(httpConfiguration.session, cookieSigner)

  override lazy val requestFactory: RequestFactory =
    val cookieSigner = DefaultCookieSigner(httpConfiguration.secret)
    DefaultRequestFactory(
      DefaultCookieHeaderEncoding(httpConfiguration.cookies),
      cookieBaker,
      LegacyFlashCookieBaker(httpConfiguration.flash, httpConfiguration.secret, cookieSigner)
    )

  given ActorSystem = actorSystem

  given StandaloneWSClient =
    import play.shaded.ahc.org.asynchttpclient.DefaultAsyncHttpClient
    import play.api.libs.ws.WSConfigParser
    import play.api.libs.ws.ahc.{ AhcConfigBuilder, AhcWSClientConfigParser, StandaloneAhcWSClient }
    new StandaloneAhcWSClient(
      DefaultAsyncHttpClient(
        AhcConfigBuilder(
          AhcWSClientConfigParser(
            WSConfigParser(configuration.underlying, environment.classLoader).parse(),
            configuration.underlying,
            environment.classLoader
          ).parse()
        ).modifyUnderlying(_.setIoThreadsCount(8)).build()
      )
    )

  val env: lila.app.Env =
    lila.log.system.info(s"Start loading lila modules")
    val c = lila.mon.Chronometer.sync(wire[lila.app.Env])
    lila.log.system.info(s"Loaded lila modules in ${c.showDuration}")
    c.result

  val httpFilters = Seq(
    new lila.web.HttpFilter(env.net, lila.security.Mobile.LichessMobileUa.parse)
  )

  override lazy val httpErrorHandler =
    lila.app.http.ErrorHandler(
      environment = environment,
      config = configuration,
      router = router,
      mainC = main,
      lobbyC = lobby
    )

  override lazy val httpRequestHandler: HttpRequestHandler =
    lila.app.http.HttpRequestHandler(
      router,
      httpErrorHandler,
      httpConfiguration,
      httpFilters,
      controllerComponents
    )

  lazy val devAssetsController =
    given FileMimeTypes = fileMimeTypes
    wire[ExternalAssets]
  lazy val account: Account = wire[Account]
  lazy val analyse: Analyse = wire[Analyse]
  lazy val api: Api = wire[Api]
  lazy val appealC: appeal.Appeal = wire[appeal.Appeal]
  lazy val auth: Auth = wire[Auth]
  lazy val challenge: Challenge = wire[Challenge]
  lazy val dasher: Dasher = wire[Dasher]
  lazy val dev: Dev = wire[Dev]
  lazy val `export`: Export = wire[Export]
  lazy val game: Game = wire[Game]
  lazy val github: Github = wire[Github]
  lazy val i18n: I18n = wire[I18n]
  lazy val importer: Importer = wire[Importer]
  lazy val lobby: Lobby = wire[Lobby]
  lazy val main: Main = wire[Main]
  lazy val mod: Mod = wire[Mod]
  lazy val gameMod: GameMod = wire[GameMod]
  lazy val notifyC: Notify = wire[Notify]
  lazy val oAuth: OAuth = wire[OAuth]
  lazy val oAuthToken: OAuthToken = wire[OAuthToken]
  lazy val playground: Playground = wire[Playground]
  lazy val pref: Pref = wire[Pref]
  lazy val push: Push = wire[Push]
  lazy val puzzle: Puzzle = wire[Puzzle]
  lazy val relation: Relation = wire[Relation]
  lazy val reportC: report.Report = wire[report.Report]
  lazy val round: Round = wire[Round]
  lazy val setup: Setup = wire[Setup]
  lazy val timeline: Timeline = wire[Timeline]
  lazy val user: User = wire[User]
  lazy val userAnalysis: UserAnalysis = wire[UserAnalysis]
  lazy val dgt: DgtCtrl = wire[DgtCtrl]
  lazy val bulkPairing: BulkPairing = wire[BulkPairing]
  lazy val cms: Cms = wire[Cms]

  // eagerly wire up all controllers
  private val appealRouter: _root_.router.appeal.Routes = wire[_root_.router.appeal.Routes]
  private val reportRouter: _root_.router.report.Routes = wire[_root_.router.report.Routes]
  val router: Router = wire[_root_.router.router.Routes]

  lila.common.Uptime.startedAt
  UiEnv.setEnv(env)

  if configuration.get[Boolean]("kamon.enabled") then kamon.Kamon.init()
