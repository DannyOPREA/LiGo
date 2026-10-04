package lila.game

import chess.{ ByColor, Status }
import ligo.gorules.{ GameResult, GoGame, Sgf, SgfInfo, SgfTime }

import lila.core.LightUser
import lila.core.game.PgnDump.WithFlags
import lila.core.game.{ Game, GoBridge, Player }

/** A Go game as an SGF record (unit 4.11): the game's own state, written by `libs/go-rules`' `Sgf.write`,
  * plus the game information lila knows (players, ranks, date, place, time, result). The Go counterpart of
  * `PgnDump`; it is pure, so the names and the site address are passed in by the caller.
  */
object SgfDump:

  val contentType = "application/x-go-sgf"

  /** The record, or `None` for a game that is not a Go game. Like the PGN and JSON exports, it holds back a
    * game in play's last moves when `flags.delayMoves` asks for it (an untrusted caller), and has no moves
    * with `moves = false`.
    */
  def apply(
      game: Game,
      names: ByColor[String],
      place: String,
      flags: WithFlags = WithFlags()
  ): Option[String] =
    game.go.flatMap: go =>
      val shown =
        if flags.moves then PgnDump.applyDelay(go.actions, flags.keepDelayIf(game.playable)).toVector
        else Vector.empty
      // A prefix of a stored game's accepted actions replays; the record is the game as far as it is shown.
      val record = if shown.size == go.actions.size then Some(go) else GoGame.replay(go.setup, shown).toOption
      record.map(r => Sgf.write(r, info(game, names, place)))

  def info(game: Game, names: ByColor[String], place: String): SgfInfo =
    SgfInfo(
      black = Some(names.black),
      white = Some(names.white),
      blackRank = rank(game.blackPlayer),
      whiteRank = rank(game.whitePlayer),
      date = Some(game.createdAt.atZone(java.time.ZoneOffset.UTC).toLocalDate),
      place = Some(place),
      time = time(game),
      result = result(game)
    )

  /** A player as lila names them elsewhere: the user's name, "Anonymous", or the AI with its level. */
  def playerName(p: Player, user: Option[LightUser]): String =
    p.aiLevel match
      case Some(level) => s"LiGo AI level $level"
      case None => user.fold(p.name.fold(UserName.anonymous.value)(_.value))(_.name.value)

  /** The rank label ("5k", "1d", "5k?" while provisional) as the rest of the site shows it (unit 5.5). */
  private def rank(p: Player): Option[String] = if p.aiLevel.isDefined then None else Namer.ratingString(p)

  /** The clock as SGF `TM`/`OT`. A correspondence game has days per move; a live one has Fischer time. A game
    * with neither (untimed) has none. Byo-yomi is not stored on a game yet, so it can't be written here.
    */
  def time(game: Game): Option[SgfTime] =
    game.daysPerTurn
      .map(d => SgfTime.Correspondence(d.value))
      .orElse(game.clockConfig.map(c => SgfTime.Fischer(c.limitSeconds.value, c.incrementSeconds.value)))

  /** `RE` (R-RES-2). Only the endings that need no count are written: resignation `B+R`, a flag `W+T`, and a
    * forfeit `B+F` (a player who left, never moved in a game that couldn't be aborted, or cheated). A game
    * that ended with a count, by two passes or the ply cap, or never finished or started, has none. Counted
    * results (`B+3.5`, `0`, `Void`) follow once the scoring phase (unit 4.8) stores them.
    */
  def result(game: Game): Option[GameResult] =
    for
      winner <- game.winnerColor.map(GoBridge.goColor)
      r <- game.status match
        case Status.Resign => Some(GameResult.Resigned(winner))
        case Status.Outoftime => Some(GameResult.OutOfTime(winner))
        case Status.Timeout | Status.NoStart | Status.Cheat => Some(GameResult.Forfeit(winner))
        case _ => None
    yield r
