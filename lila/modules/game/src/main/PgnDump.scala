package lila.game

import chess.format.pgn.{ InitialComments, Parser, Pgn, Tag, TagType, Tags }
import chess.format.Fen
import chess.opening.Opening
import chess.{ ByColor, Color, Outcome, Ply }
import chess.rating.IntRatingDiff

import lila.core.LightUser
import lila.core.config.RouteUrl
import lila.core.game.PgnDump.WithFlags
import lila.core.game.{ Game, Player }
import lila.game.GameExt.perfType
import lila.game.Player.nameSplit

final class PgnDump(
    routeUrl: RouteUrl,
    lightUserApi: lila.core.user.LightUserApiMinimal,
    fideIdOf: lila.core.user.PublicFideIdOf
)(using Executor)
    extends lila.core.game.PgnDump:

  import PgnDump.*

  def apply(
      game: Game,
      initialFen: Option[Fen.Full],
      opening: Option[Opening.AtPly],
      flags: WithFlags
  ): Fu[Pgn] =
    val imported = game.pgnImport.flatMap: pgni =>
      Parser.tags(pgni.pgn).toOption

    val tagsFuture =
      if flags.tags then
        tags(
          game,
          initialFen,
          imported,
          opening.map(_.opening),
          withRating = flags.rating
        )
      else fuccess(Tags(Nil))

    tagsFuture.map: ts =>
      val ply = ts.fen.flatMap(Fen.readWithMoveNumber).fold(Ply.initial)(_.ply)
      // A Go game has no PGN moves: its record is SGF (Phase 4, unit 4.11); until then only the headers.
      Pgn(ts, InitialComments.empty, none, ply.next)

  def gameUrl(id: GameId) = routeUrl(routes.Round.watcher(id, Color.White))

  private type GameUsers = ByColor[Option[LightUser]]

  private def gameLightUsers(game: Game): Fu[GameUsers] =
    game.players.traverse(_.userId.so(lightUserApi.async))

  private def rating(p: Player) = p.rating.orElse(p.nameSplit.flatMap(_._2)).fold("?")(_.toString)

  def player(p: Player, u: Option[LightUser]): String | UserName =
    p.aiLevel.fold(
      u.fold(p.nameSplit.map(_._1.value).orElse(p.name.map(_.value)) | UserName.anonymous)(_.name)
    )("lichess AI level " + _)

  private val customStartPosition: Set[chess.variant.Variant] =
    Set(chess.variant.Chess960, chess.variant.FromPosition, chess.variant.Horde, chess.variant.RacingKings)

  private def eventOf(game: Game) =
    val perf = game.perfType.nameKey
    game.tournamentId
      .map(id => s"${game.rated.name} $perf tournament https://lichess.org/tournament/$id")
      .orElse(game.simulId.map(id => s"$perf simul https://lichess.org/simul/$id"))
      .getOrElse(s"${game.rated.name} $perf game")

  private def ratingDiffTag(p: Player, tag: Tag.type => TagType) =
    p.ratingDiff.map(rd => Tag(tag(Tag), s"${if !rd.negative then "+" else ""}$rd"))

  def tags(
      game: Game,
      initialFen: Option[Fen.Full],
      importedTags: Option[Tags],
      opening: Option[Opening],
      withRating: Boolean
  ): Fu[Tags] = for
    users <- gameLightUsers(game)
    fideIds <- users.traverse(_.so(fideIdOf))
  yield Tags:
    val importedDate = importedTags.flatMap(_.apply(_.Date))
    List[Option[Tag]](
      Tag(
        _.Event,
        importedTags.flatMap(_.apply(_.Event)) | {
          if game.sourceIs(_.Import) then "Import" else eventOf(game)
        }
      ).some,
      Tag(_.Site, importedTags.flatMap(_.apply(_.Site)) | gameUrl(game.id)).some,
      Tag(_.GameId, game.id).some,
      Tag(_.Date, importedDate | Tag.UTCDate.format.print(game.createdAt)).some,
      Tag(_.Round, importedTags.flatMap(_.apply(_.Round)) | "-").some,
      Tag(_.White, player(game.whitePlayer, users.white)).some,
      Tag(_.Black, player(game.blackPlayer, users.black)).some,
      Tag(_.Result, result(game)).some,
      importedDate.isEmpty.option:
        Tag(_.UTCDate, importedTags.flatMap(_.apply(_.UTCDate)) | Tag.UTCDate.format.print(game.createdAt))
      ,
      importedDate.isEmpty.option:
        Tag(_.UTCTime, importedTags.flatMap(_.apply(_.UTCTime)) | Tag.UTCTime.format.print(game.createdAt))
      ,
      withRating.option(Tag(_.WhiteElo, rating(game.whitePlayer))),
      withRating.option(Tag(_.BlackElo, rating(game.blackPlayer))),
      withRating.so(ratingDiffTag(game.whitePlayer, _.WhiteRatingDiff)),
      withRating.so(ratingDiffTag(game.blackPlayer, _.BlackRatingDiff)),
      users.white.flatMap(_.title).map(Tag(_.WhiteTitle, _)),
      users.black.flatMap(_.title).map(Tag(_.BlackTitle, _)),
      fideIds.white.map(Tag(_.WhiteFideId, _)),
      fideIds.black.map(Tag(_.BlackFideId, _)),
      game.whitePlayer.berserk.option(Tag("WhiteBerserk", game.whitePlayer.berserk)),
      game.blackPlayer.berserk.option(Tag("BlackBerserk", game.blackPlayer.berserk)),
      Tag(_.Variant, game.variant.name.capitalize).some,
      game.daysPerTurn
        .map(dpt => Tag(_.TimeControl, s"$dpt day${if dpt.value > 1 then "s" else ""} per move"))
        .orElse(Tag.timeControl(game.clock.map(_.config)).some),
      opening.map(o => Tag(_.ECO, o.eco)),
      opening.map(o => Tag(_.Opening, o.name)),
      Tag(
        _.Termination, {
          import chess.Status.*
          game.status match
            case Created | Started => "Unterminated"
            case Aborted | NoStart => "Abandoned"
            case Timeout | Outoftime => "Time forfeit"
            case Resign | Draw | Stalemate | Mate | VariantEnd => "Normal"
            case InsufficientMaterialClaim => "Insufficient material"
            case Cheat => "Rules infraction"
            case UnknownFinish => "Unknown"
        }
      ).some
    ).flatten ::: customStartPosition(game.variant)
      .so(initialFen)
      .so(fen => List(Tag(_.FEN, fen.value), Tag("SetUp", "1")))

object PgnDump:

  export lila.core.game.PgnDump.*

  private val delayMovesBy = 3
  private val delayKeepsFirstMoves = 5

  def applyDelay[M](moves: Seq[M], flags: WithFlags): Seq[M] =
    if !flags.delayMoves then moves
    else moves.take((moves.size - delayMovesBy).atLeast(delayKeepsFirstMoves))

  def result(game: Game) =
    Outcome.showResult(game.finished.option(Outcome(game.winnerColor)))
