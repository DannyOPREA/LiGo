package lila.game

import chess.{ ByColor, Status }
import ligo.gorules.{ GameResult, GoGame, Sgf, SgfInfo, SgfTime }

import lila.core.LightUser
import lila.core.game.GameExport.WithFlags
import lila.core.game.{ Game, GoBridge, Player }

/** A Go game as an SGF record (unit 4.11): the game's own state, written by `libs/go-rules`' `Sgf.write`,
  * plus the game information lila knows (players, ranks, date, place, time, result). It takes the place of
  * chess's `PgnDump` (removed in unit 3.17); it is pure, so the names and the site address are passed in by
  * the caller.
  */
object SgfDump:

  val contentType = "application/x-go-sgf"

  /** The record (`None` only if the shown moves fail to replay, which a stored game's don't). Like the PGN
    * and JSON exports, it holds back a game in play's last moves when `flags.delayMoves` asks for it (an
    * untrusted caller), and has no moves with `moves = false`.
    */
  def apply(
      game: Game,
      names: ByColor[String],
      place: String,
      flags: WithFlags = WithFlags()
  ): Option[String] =
    val go = game.go
    val shown =
      if flags.moves then GameExport.applyDelay(go.actions, flags.keepDelayIf(game.playable)).toVector
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

  /** The clock as SGF `TM`/`OT`. A correspondence game has days per move; a live one has Fischer time or
    * byo-yomi (unit 4.7's clock, written `OT[5x30 byo-yomi]` as Sabaki and CGoban read it). A game with none
    * (untimed) has none.
    */
  def time(game: Game): Option[SgfTime] =
    game.daysPerTurn
      .map(d => SgfTime.Correspondence(d.value))
      .orElse(game.clockConfig.map(c => SgfTime.Fischer(c.limitSeconds.value, c.incrementSeconds.value)))
      .orElse(game.byoyomi.map(b => SgfTime.Byoyomi(b.config)))

  /** `RE` (R-RES-2): resignation `B+R`, a flag `W+T`, a forfeit `B+F` (a player who left, never moved in a
    * game that couldn't be aborted, or cheated), the scoring phase's count `B+3.5` or `0` for jigo (unit 4.8,
    * kept on the finished game as `goScoring`), and `Void` when the scoring phase ended with no count (ADR
    * 0020 §4). A game that never finished, was aborted, or has no stored count, has none.
    */
  def result(game: Game): Option[GameResult] =
    def won(r: chess.Color => GameResult) = game.winnerColor.map(r)
    game.status match
      case Status.Resign => won(c => GameResult.Resigned(GoBridge.goColor(c)))
      case Status.Outoftime => won(c => GameResult.OutOfTime(GoBridge.goColor(c)))
      case Status.Timeout | Status.NoStart | Status.Cheat => won(c => GameResult.Forfeit(GoBridge.goColor(c)))
      case Status.VariantEnd => game.goScoring.flatMap(_.result)
      case Status.UnknownFinish => game.goScoring.map(_ => GameResult.NoResult)
      case _ => None
