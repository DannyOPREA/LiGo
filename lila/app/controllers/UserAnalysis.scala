package controllers

import play.api.libs.json.Json
import play.api.mvc.*

import lila.app.{ *, given }
import lila.common.HTTPRequest
import lila.core.id.GameFullId
import lila.tree.ExportOptions

final class UserAnalysis(
    env: Env,
    gameC: => Game
) extends LilaController(env)
    with lila.web.TheftPrevention:

  // The analysis board is a placeholder until Phase 7's Go analysis board (unit 7.4) replaces it (unit
  // 3.16): the chess board it was can't show a Go position.
  private def comingLater(using Context) = Ok.page:
    views.site.message.comingLater(
      "Analysis board",
      "The analysis board for Go arrives in a later update. Finished games can be replayed on their game page."
    )

  def index = Open(comingLater)

  def parseArg(@annotation.unused arg: String) = Open(comingLater)

  def pgn(@annotation.unused pgn: String) = Open(comingLater)

  def embed = Anon:
    InEmbedContext:
      NotFound.snip(views.analyse.embed.notFound)

  // correspondence premove aka forecast
  // also used by lichobile for post-game analysis
  def game(id: GameId, color: Color) = Open:
    Found(env.game.gameRepo.game(id)): g =>
      env.round.proxyRepo.upgradeIfPresent(g).flatMap { game =>
        val pov = Pov(game, color)
        negotiateApi(
          html =
            if game.replayable then Redirect(routes.Round.watcher(game.id, color))
            else if game.isGo then comingLater
            else
              val owner = isMyPov(pov)
              for
                initialFen <- env.game.gameRepo.initialFen(game)
                data <-
                  env.api.roundApi
                    .userAnalysisJson(
                      pov,
                      ctx.pref,
                      initialFen,
                      pov.color,
                      owner = owner
                    )
                withForecast = owner && !pov.game.synthetic && pov.game.playable
                page <- renderPage:
                  views.analyse.ui.userAnalysis(data, pov, withForecast = withForecast)
              yield Ok(page).noCache
          ,
          api = _ => mobileAnalysis(pov)
        )
      }

  private def mobileAnalysis(pov: Pov)(using ctx: Context): Fu[Result] = for
    initialFen <- env.game.gameRepo.initialFen(pov.game)
    users <- env.user.api.gamePlayers.analysis(pov.game)
    owner = isMyPov(pov)
    _ = gameC.preloadUsers(users)
    analysis <- env.analyse.analyser.get(pov.game)
    crosstable <- env.game.crosstableApi(pov.game)
    data <- env.api.roundApi.review(
      pov,
      users,
      analysis,
      env.game.gameOpening.of(pov.game, ctx.isAuth),
      initialFen = initialFen,
      tv = none,
      withFlags = ExportOptions(
        division = true,
        clocks = true,
        movetimes = true,
        rating = ctx.pref.showRatings,
        lichobileCompat = HTTPRequest.isLichobile(ctx.req)
      ),
      owner = owner
    )
  yield
    import lila.game.JsonView.given
    Ok(data.add("crosstable", crosstable))

  private def forecastReload = JsonOk(Json.obj("reload" -> true))

  def forecastsPost(fullId: GameFullId) = AuthOrScopedBodyWithParser(parse.json)(_.Web.Mobile) { ctx ?=> _ ?=>
    import lila.round.Forecast
    Found(env.round.proxyRepo.pov(fullId)): pov =>
      if isTheft(pov) then theftResponse
      else if !Forecast.isValid(ctx.body.body) then BadRequest
      else
        ctx.body.body
          .validate[Forecast.Steps]
          .fold(
            err => BadRequest(err.toString),
            forecasts =>
              val fu = for
                _ <- env.round.forecastApi.save(pov, forecasts)
                res <- env.round.forecastApi.loadForDisplay(pov)
              yield res.fold(JsonOk(Json.obj("none" -> true)))(JsonOk(_))
              fu.recover:
                case Forecast.OutOfSync => forecastReload
                case _: lila.core.round.ClientError => forecastReload
          )
  }

  def forecastsGet(fullId: GameFullId) = Scoped(_.Web.Mobile) { _ ?=> _ ?=>
    Found(env.round.proxyRepo.pov(fullId)): pov =>
      JsonOk(env.round.mobile.forecast(pov.game, pov.fullId.anyId))
  }

  def forecastsOnMyTurn(fullId: GameFullId, uci: String) =
    AuthOrScopedBodyWithParser(parse.json)(_.Web.Mobile) { ctx ?=> _ ?=>
      import lila.round.Forecast
      Found(env.round.proxyRepo.pov(fullId)): pov =>
        if isTheft(pov) then theftResponse
        else if !Forecast.isValid(ctx.body.body) then BadRequest
        else
          ctx.body.body
            .validate[Forecast.Steps]
            .fold(
              err => BadRequest(err.toString),
              forecasts =>
                for
                  _ <- env.round.forecastApi.playAndSave(pov, uci, forecasts).recoverDefault
                  wait = (1 + Forecast.maxPlies(forecasts).min(10)) * 50
                  _ <- lila.common.LilaFuture.sleep(wait.millis)
                yield forecastReload
            )
    }

  def help = Open:
    Ok.snip:
      lila.web.ui.help.analyse(getBool("study"))
