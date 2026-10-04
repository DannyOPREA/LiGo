package controllers

import play.api.libs.json.Json
import play.api.mvc.*

import lila.app.*
import lila.core.misc.lpv.LpvEmbed

final class Analyse(env: Env) extends LilaController(env):

  // requestAnalysis (a server analysis by fishnet) went with the fishnet module (unit 3.5), and the chess
  // replay page with chess games (unit 3.17): a finished Go game stays on its round page.

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
                    title = "LiGo game viewer",
                    Json.obj("orientation" -> color.name)
                  )
          case _ =>
            render:
              case AcceptsPgn() => NotFound("*")
              case _ => NotFound.snip(views.analyse.embed.notFound)
