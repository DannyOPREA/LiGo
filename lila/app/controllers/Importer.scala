package controllers

import lila.app.*

final class Importer(env: Env) extends LilaController(env):

  // PGN import went with chess games (unit 3.17); SGF import takes its place in Phase 7 (unit 7.5).
  private def comingLater(using Context) = Ok.page:
    views.site.message.comingLater(
      "Import a game",
      "Importing a game from an SGF file arrives in a later update."
    )

  def importGame = Open(comingLater)

  def sendGame = OpenOrScopedBody(parse.anyContent)()(doSendGame)
  def apiSendGame = AnonOrScopedBody(parse.anyContent)()(notImplemented)
  private def doSendGame(using BodyContext[Any]) =
    negotiate(html = comingLater, json = notImplemented)
  private def notImplemented = NotImplemented(jsonError("Game import takes SGF files from a later update."))
