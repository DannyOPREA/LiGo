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
    analysis <- env.analyse.analyser.get(pov.game)
    crosstable <- env.game.crosstableApi(pov.game)
    data <- env.api.roundApi.review(
      pov,
      users,
      analysis,
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
