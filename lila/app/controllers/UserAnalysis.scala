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

  // A stored game opens in the analysis board (unit 7.5, ADR 0023 §2): an import with the SGF text it was
  // stored with, any other game with the server's record. A game still in play is shown with the move delay
  // everywhere else applies, and its own players are sent back to their game. lichobile's post-game
  // analysis (the `api` case) is kept.
  def game(id: GameId, color: Color) = Open:
    Found(env.game.gameRepo.game(id)): g =>
      env.round.proxyRepo.upgradeIfPresent(g).flatMap { game =>
        val pov = Pov(game, color)
        negotiateApi(
          html =
            if playablePovForReq(game).isDefined then Redirect(routes.Round.watcher(game.id, color))
            else gamePage(pov),
          api = _ => mobileAnalysis(pov)
        )
      }

  private def gamePage(pov: Pov)(using ctx: Context): Fu[Result] =
    for
      users <- env.user.api.gamePlayers(pov.game.userIdPair, pov.game.perfKey)
      _ = gameC.preloadUsers(users)
      sgf <- gameSgf(pov.game)
      page <- renderPage(views.analyse.ui.gameAnalysis(pov, sgf, ctx.pref.coords))
    yield Ok(page).noCache

  /** The record the board opens: an import's own text, else the game as SGF (delayed while it is played). */
  private def gameSgf(game: lila.core.game.Game): Fu[String] =
    game.sgfImport match
      case Some(i) => fuccess(i.sgf)
      case None =>
        given Option[Me] = none // the page never reads a player's private fields
        env.api.gameApiV2.exportOne(
          game,
          lila.api.GameApiV2.OneConfig(
            lila.api.GameApiV2.Format.SGF,
            lila.game.GameExport.WithFlags(delayMoves = true)
          )
        )

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
