package lila.api

import chess.format.Fen
import chess.format.pgn.{ Pgn, PgnStr }
import chess.opening.Opening

import lila.game.PgnDump.WithFlags

final class PgnDump(
    val dumper: lila.game.PgnDump
)(using Executor):

  def apply(
      game: Game,
      initialFen: Option[Fen.Full],
      opening: Option[Opening.AtPly],
      flags: WithFlags
  ): Fu[Pgn] =
    // game.simulId/tournamentId/swissId are neutral fields kept in game storage (unit 3.2); no
    // simul, tournament or swiss feature exists any more to name them for the PGN "Event" tag.
    // Engine evals and the literate annotations (chess status text, opening, engine advice) went with
    // chess analysis (unit 3.17, slice b): `evals`, `literate` and `accuracy` no longer change the output.
    dumper(game, initialFen, opening, flags)

  def formatter(
      flags: WithFlags
  ): (Game, Option[Fen.Full], Option[Opening.AtPly]) => Fu[String] =
    (
        game: Game,
        initialFen: Option[Fen.Full],
        opening: Option[Opening.AtPly]
    ) => apply(game, initialFen, opening, flags).map(PgnDump.toPgnString).dmap(_.value)

object PgnDump:
  def toPgnString(pgn: Pgn): PgnStr = PgnStr(s"${pgn.render}\n\n\n")
