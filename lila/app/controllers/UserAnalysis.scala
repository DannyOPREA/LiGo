package controllers

import play.api.mvc.*

import lila.app.*
import lila.common.HTTPRequest
import lila.tree.ExportOptions

final class UserAnalysis(
    env: Env,
    gameC: => Game
) extends LilaController(env)
    with lila.web.TheftPrevention:

  // A game opens in the analysis board in unit 7.5 (ADR 0023 §2); until then its page says so (unit 3.16).
  private def comingLater(using Context) = Ok.page:
    views.site.message.comingLater(
      "Game analysis",
      "Opening a game in the analysis board arrives in a later update. Finished games can be replayed on their game page."
    )

  // The Go analysis board (unit 7.4): everything happens in the browser, nothing is stored.
  def index = Open:
    for page <- renderPage(views.analyse.ui.userAnalysis(ctx.pref.coords))
    yield Ok(page).withCanonical(routes.UserAnalysis.index)

  // lila's chess addresses (`/analysis/<variant>/<fen>`, `/analysis/pgn/<moves>`) open the Go board.
  def parseArg(@annotation.unused arg: String) = Open(Redirect(routes.UserAnalysis.index))

  def pgn(@annotation.unused pgn: String) = Open(Redirect(routes.UserAnalysis.index))

  def embed = Anon:
    InEmbedContext:
      NotFound.snip(views.analyse.embed.notFound)

  // used by lichobile for post-game analysis; forecasts went with chess moves (unit 3.17)
  def game(id: GameId, color: Color) = Open:
    Found(env.game.gameRepo.game(id)): g =>
      env.round.proxyRepo.upgradeIfPresent(g).flatMap { game =>
        val pov = Pov(game, color)
        negotiateApi(
          html =
            if game.replayable then Redirect(routes.Round.watcher(game.id, color))
            else comingLater,
          api = _ => mobileAnalysis(pov)
        )
      }

  private def mobileAnalysis(pov: Pov)(using ctx: Context): Fu[Result] = for
    users <- env.user.api.gamePlayers.analysis(pov.game)
    _ = gameC.preloadUsers(users)
    crosstable <- env.game.crosstableApi(pov.game)
    data <- env.api.roundApi.review(
      pov,
      users,
      tv = none,
      withFlags = ExportOptions(
        clocks = true,
        movetimes = true,
        rating = ctx.pref.showRatings,
        lichobileCompat = HTTPRequest.isLichobile(ctx.req)
      )
    )
  yield
    import lila.game.JsonView.given
    Ok(data.add("crosstable", crosstable))

  def help = Open:
    Ok.snip:
      lila.web.ui.help.analyse(getBool("study"))
