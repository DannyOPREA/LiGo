package controllers

import chess.format.Fen
import play.api.libs.json.Json
import play.api.mvc.*

import lila.app.{ *, given }
import lila.common.HTTPRequest
import lila.core.misc.lpv.LpvEmbed
import lila.game.PgnDump
import lila.tree.ExportOptions

final class Analyse(
    env: Env,
    gameC: => Game,
    roundC: => Round
) extends LilaController(env):

  // requestAnalysis (a server analysis by fishnet) went with the fishnet module (unit 3.5).

  private[controllers] def replay(pov: Pov, userTv: Option[lila.user.User])(using ctx: Context) =
    if ctx.req.client.isCrawler then replayForCrawler(pov)
    else
      for
        initialFen <- env.game.gameRepo.initialFen(pov.game)
        users <- env.user.api.gamePlayers(pov.game.players.map(_.userId), pov.game.perfKey)
        _ = gameC.preloadUsers(users)
        res <- RedirectAtFen(pov, initialFen):
          val pgnFlags = PgnDump.WithFlags(
            clocks = false,
            rating = ctx.pref.showRatings,
            opening = ctx.isAuth.option(true)
          )
          val opening = pgnFlags.opening.so(env.game.gameOpening.atPly(pov.game, _))
          (
            env.analyse.analyser.get(pov.game),
            fuccess(false), // no server analysis can be in progress without fishnet (unit 3.5)
            roundC.getWatcherChat(pov.game),
            ctx.noBlind.so(env.game.crosstableApi.withMatchup(pov.game)),
            env.bookmark.api.exists(pov.game, ctx.me),
            env.api.pgnDump(
              pov.game,
              initialFen,
              analysis = none,
              opening = opening,
              pgnFlags
            )
          ).flatMapN: (analysis, analysisInProgress, chat, crosstable, bookmarked, pgn) =>
            env.api.roundApi
              .review(
                pov,
                users,
                analysis,
                opening.map(_.opening),
                initialFen = initialFen,
                tv = userTv.map: u =>
                  lila.round.OnTv.User(u.id),
                withFlags = ExportOptions(
                  movetimes = true,
                  clocks = true,
                  division = true,
                  rating = ctx.pref.showRatings,
                  lichobileCompat = HTTPRequest.isLichobile(ctx.req),
                  puzzles = true
                )
              )
              .flatMap: data =>
                Ok.page(
                  views.analyse.replay.forBrowser(
                    pov,
                    data,
                    initialFen,
                    env.analyse.annotator(pgn, pov.game, analysis, opening).render,
                    analysis,
                    analysisInProgress,
                    crosstable,
                    userTv,
                    chat,
                    bookmarked = bookmarked
                  )
                ).map(_.enforceCrossSiteIsolation)
      yield res

  def embed(gameId: GameId, color: Color) = embedReplayGame(gameId, color)

  val AcceptsPgn = Accepting("application/x-chess-pgn")

  def embedReplayGame(gameId: GameId, color: Color) = Anon:
    InEmbedContext:
      env.api.textLpvExpand
        .getPgn(gameId)
        .map:
          case Some(LpvEmbed.PublicPgn(pgn)) =>
            render:
              case AcceptsPgn() => Ok(pgn)
              case _ =>
                Ok.snip:
                  views.analyse.embed.lpv(
                    pgn,
                    getPgn = true,
                    title = "Lichess PGN viewer",
                    Json.obj("orientation" -> color.name)
                  )
          case _ =>
            render:
              case AcceptsPgn() => NotFound("*")
              case _ => NotFound.snip(views.analyse.embed.notFound)

  private def RedirectAtFen(pov: Pov, initialFen: Option[Fen.Full])(or: => Fu[Result])(using
      Context
  ): Fu[Result] =
    (get("fen").map(Fen.Full.clean): Option[Fen.Full]).fold(or): atFen =>
      val url = routes.Round.watcher(pov.gameId, pov.color)
      chess.Replay
        .plyAtFen(pov.game.sans, initialFen, pov.game.variant, atFen)
        .fold(
          _ => Redirect(url),
          ply => Redirect(s"$url#$ply")
        )

  private def replayForCrawler(pov: Pov)(using Context) = for
    initialFen <- env.game.gameRepo.initialFen(pov.game)
    analysis <- env.analyse.analyser.get(pov.game)
    crosstable <- env.game.crosstableApi.withMatchup(pov.game)
    pgn <- env.api.pgnDump(pov.game, initialFen, analysis, none, PgnDump.WithFlags(clocks = false))
    page <- renderPage:
      views.analyse.replay.forCrawler(
        pov,
        initialFen,
        env.analyse.annotator(pgn, pov.game, analysis, none).render,
        crosstable
      )
  yield Ok(page)
