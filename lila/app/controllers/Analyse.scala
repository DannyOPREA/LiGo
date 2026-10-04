package controllers

import lila.app.*

final class Analyse(env: Env) extends LilaController(env):

  // requestAnalysis (a server analysis by fishnet) went with the fishnet module (unit 3.5), the chess
  // replay page with chess games, and the embedded chess game viewer with PGN (unit 3.17): a finished Go
  // game stays on its round page.

  def embed(gameId: GameId, color: Color) = embedReplayGame(gameId, color)

  def embedReplayGame(@annotation.unused gameId: GameId, @annotation.unused color: Color) = Anon:
    InEmbedContext:
      NotFound.snip(views.analyse.embed.notFound)
