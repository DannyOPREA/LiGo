package lila.api

import lila.core.id.*

final class AnySearch(
    gameEnv: lila.game.Env,
    puzzleEnv: lila.puzzle.Env,
    ublogApi: lila.ublog.UblogApi,
    teamEnv: lila.team.Env
)(using Executor):

  private val idRegex = """^[a-zA-Z0-9]{4,12}$""".r

  def redirect(str: String): Fu[Option[String]] =
    str.trim.some
      .filter(idRegex.matches)
      .so: id =>
        def game = gameEnv.gameRepo.exists(GameId(id)).map(_.option(s"/$id"))

        def puzzle = puzzleEnv.api.puzzle.find(PuzzleId(id)).map2(_ => routes.Puzzle.show(id).url)

        // tournament/swiss lookup was removed with the tournament and swiss modules (unit 3.2)
        // broadcast/study/fide-player lookup was removed with the relay, study and fide modules
        // (unit 3.3)

        def ublog = ublogApi.getPost(UblogPostId(id)).map2(_ => routes.Ublog.redirect(UblogPostId(id)).url)

        def team = teamEnv.teamRepo.enabled(TeamId(id)).map2(_ => routes.Team.show(TeamId(id)).url)

        game
          .orElse(puzzle)
          .orElse(ublog)
          .orElse(team)
