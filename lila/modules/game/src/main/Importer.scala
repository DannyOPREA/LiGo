package lila.game
package importer

import chess.{ ByColor, Color, PlayerName, Rated, Status }
import ligo.gorules.{ SgfGameInfo, SgfReader, SgfResult }
import play.api.data.*
import play.api.data.Forms.*

import lila.core.game.{ Game, GoBridge, Source, newGoGame }
import lila.game.GameExt.finish

/** Stores a Go game from SGF text (unit 7.5, ADR 0023 §2): the server reads the first game of the record with
  * `libs/go-rules` (`ligo.gorules.SgfImport`, unit 7.3), keeps the main line as a finished game that nobody
  * can play, and keeps the SGF text beside it, so the game page can open the analysis board on the whole
  * record, variations and comments included. It takes the place of lila's `PgnImport`.
  */
final class Importer(gameRepo: GameRepo)(using Executor):

  /** The game stored for this text, or why it can't be stored. Importing the same file twice returns the
    * first copy (by hash of the whole text); the text is parsed once, after the cheap checks.
    */
  def importAsGame(sgf: String, user: Option[UserId]): Fu[Either[String, Game]] =
    import lila.db.dsl.{ *, given }
    import lila.core.game.BSONFields as F
    import gameRepo.coll
    import BSONHandlers.gameHandler
    Importer
      .checkSize(sgf)
      .fold(
        err => fuccess(Left(err)),
        _ =>
          coll
            .one[Game](bdoc(s"${F.sgfImport}.h" -> SgfImport.hash(sgf)))
            .flatMap:
              case Some(game) => fuccess(Right(game))
              case None =>
                Importer
                  .parse(sgf, user)
                  .fold(
                    err => fuccess(Left(err)),
                    game =>
                      for
                        _ <- gameRepo.insertDenormalized(game)
                        _ <- game.sgfImport
                          .flatMap(_.user)
                          .isDefined
                          .so:
                            // import date, used to make a compound sparse index with the user
                            coll.updateField(bid(game.id), s"${F.sgfImport}.ca", game.createdAt).void
                        _ <- gameRepo.finish(game.id, game.winnerColor, None, game.status)
                      yield Right(game)
                  )
      )

object Importer:

  /** What the server accepts as text: at most 200 KB (ADR 0023 §2), checked before anything is read. */
  def checkSize(sgf: String): Either[String, Unit] =
    Either.cond(
      sgf.length <= SgfReader.maxBytes && sgf
        .getBytes(java.nio.charset.StandardCharsets.UTF_8)
        .length <= SgfReader.maxBytes,
      (),
      s"The SGF is longer than ${SgfReader.maxBytes / 1024} KB."
    )

  /** The form and the API's body: one `sgf` field, capped before any parsing (chars never outnumber bytes).
    */
  val form = Form(single("sgf" -> nonEmptyText(maxLength = SgfReader.maxBytes)))

  /** An imported SGF as a finished Go game, not yet stored: the main line replayed by go-rules, players as
    * names (ranks as text), the result from `RE`. The reason is in English for the page and the API, with the
    * move number when a move is the cause.
    */
  def parse(
      sgf: String,
      user: Option[UserId],
      actionCap: Int = ligo.gorules.SgfImport.maxActions
  ): Either[String, Game] =
    ligo.gorules.SgfImport(sgf, actionCap).left.map(_.text).flatMap { imported =>
      val info = imported.info
      newGoGame(
        imported.game.setup,
        clock = none,
        players = ByColor: c =>
          lila.game.Player.makeImported(c, playerName(info, c), rating = none),
        rated = Rated.No,
        source = Source.Import
      ).left
        .map(_.message)
        .map: made =>
          val sloppy = made.sloppy
          val stored = sloppy
            .withGo(imported.game)
            .copy(metadata =
              sloppy.metadata.copy(sgfImport =
                SgfImport.make(user = user, date = info.date.map(clean(_, 40)), sgf = sgf).some
              )
            )
          val (status, winner) = ending(info.result)
          stored.finish(status, winner)
    }

  /** `PB`/`PW` with `BR`/`WR` after it as text, "Lee Sedol (9p)": never read as a rating (ADR 0023 §2). */
  private def playerName(info: SgfGameInfo, c: Color): Option[PlayerName] =
    val (name, rank) = c.fold((info.white, info.whiteRank), (info.black, info.blackRank))
    val shown = name.map(clean(_, 60))
    val ranked = rank.map(clean(_, 12)).filter(_.nonEmpty)
    (shown.filter(_.nonEmpty), ranked) match
      case (Some(n), Some(r)) => PlayerName(s"$n ($r)").some
      case (Some(n), None) => PlayerName(n).some
      case (None, Some(r)) => PlayerName(s"? ($r)").some
      case _ => none

  /** Text from a file we don't trust: no control characters, at most `max` characters. */
  private def clean(text: String, max: Int): String =
    text.filterNot(Character.isISOControl).trim.take(max)

  /** How the record says the game ended (`RE`), as lila's statuses say it. A count or a bare win is the end
    * by counting (`VariantEnd`), as Go games here end (unit 4.8); jigo has no winner; a result that is
    * `Void`, missing or unreadable is "no result".
    */
  def ending(result: Option[SgfResult]): (Status, Option[Color]) =
    def by(winner: ligo.gorules.Color) = GoBridge.color(winner).some
    result match
      case Some(SgfResult.Points(w, _)) => (Status.VariantEnd, by(w))
      case Some(SgfResult.Won(w)) => (Status.VariantEnd, by(w))
      case Some(SgfResult.Resigned(w)) => (Status.Resign, by(w))
      case Some(SgfResult.OutOfTime(w)) => (Status.Outoftime, by(w))
      case Some(SgfResult.Forfeit(w)) => (Status.Timeout, by(w))
      case Some(SgfResult.Jigo) => (Status.VariantEnd, none)
      case Some(SgfResult.Void) | Some(SgfResult.Unknown) | None => (Status.UnknownFinish, none)
