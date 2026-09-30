package lila.api

import chess.format.Fen
import chess.format.pgn.Pgn
import chess.opening.Opening

import lila.analyse.{ Analysis, Annotator }
import lila.game.PgnDump.WithFlags

final class PgnDump(
    val dumper: lila.game.PgnDump,
    annotator: Annotator
)(using Executor):

  def apply(
      game: Game,
      initialFen: Option[Fen.Full],
      analysis: Option[Analysis],
      opening: Option[Opening.AtPly],
      flags: WithFlags
  ): Fu[Pgn] =
    // game.simulId/tournamentId/swissId are neutral fields kept in game storage (unit 3.2); no
    // simul, tournament or swiss feature exists any more to name them for the PGN "Event" tag.
    dumper(game, initialFen, opening, flags)
      .map: pgn =>
        val evaled = analysis.ifTrue(flags.evals).fold(pgn)(annotator.addEvals(pgn, _))
        if flags.literate then annotator(evaled, game, analysis, opening)
        else evaled

  def formatter(
      flags: WithFlags
  ): (Game, Option[Fen.Full], Option[Analysis], Option[Opening.AtPly]) => Fu[String] =
    (
        game: Game,
        initialFen: Option[Fen.Full],
        analysis: Option[Analysis],
        opening: Option[Opening.AtPly]
    ) => apply(game, initialFen, analysis, opening, flags).map(annotator.toPgnString).dmap(_.value)
