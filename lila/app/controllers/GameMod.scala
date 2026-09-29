package controllers

import lila.api.GameApiV2
import lila.app.{ *, given }

final class GameMod(env: Env)(using org.apache.pekko.stream.Materializer) extends LilaController(env):

  import lila.mod.GameMod.*

  def index(username: UserStr) = SecureBody(_.GamesModView) { ctx ?=> _ ?=>
    Found(meOrFetch(username)): user =>
      val form = filterForm.bindFromRequest()
      val filter = form.fold(_ => emptyFilter, identity)
      for
        povs <- fetchGames(user, filter)
        page <- renderPage(views.mod.games(user, form, povs))
      yield Ok(page)
  }

  private def fetchGames(user: lila.user.User, filter: Filter) =
    val select = toDbSelect(user, filter) ++ lila.game.Query.finished
    import org.apache.pekko.stream.scaladsl.*
    env.game.gameRepo
      .recentGamesFromSecondaryCursor(select)
      .documentSource(10_000)
      .filter: game =>
        filter.perf.forall(game.perfKey ==)
      .take(filter.nbGames)
      .mapConcat { Pov(_, user).toList }
      .runWith(Sink.seq)
      .map(_.toList)

  def post(username: UserStr) = SecureBody(_.GamesModView) { ctx ?=> me ?=>
    Found(meOrFetch(username)): user =>
      bindForm(actionForm)(
        err => BadRequest(err.toString),
        {
          case (gameIds, Some("pgn")) => downloadPgn(user, gameIds)
          // "analyse" (fishnet analysis of the selected games) went with fishnet (unit 3.5).
          case _ => notFound
        }
      )
  }

  private def downloadPgn(user: lila.user.User, gameIds: Seq[GameId])(using Context) =
    Ok.chunked:
      env.api.gameApiV2
        .exportByIds(
          GameApiV2.ByIdsConfig(
            ids = gameIds,
            format = GameApiV2.Format.PGN,
            flags = lila.game.PgnDump.WithFlags(),
            perSecond = MaxPerSecond(100),
            playerFile = none
          )
        )
    .asAttachmentStream(s"lichess_mod_${user.username}_${gameIds.size}_games.pgn")
      .as(pgnContentType)
