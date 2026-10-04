package lila.analyse

import com.softwaremill.macwire.*

import lila.core.config.CollName

@Module
final class Env(
    db: lila.db.Db,
    gameRepo: lila.core.game.GameRepo
)(using Executor):

  lazy val repo = AnalysisRepo(db(CollName("analysis2")))

  lazy val requesterApi = RequesterApi(db(CollName("analysis_requester")))

  lazy val analyser = wire[Analyser]

  val jsonView = JsonView
