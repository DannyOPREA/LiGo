package ligo.gorules

import strategygames.Player
import strategygames.go.{ Board, Chain, Game, Piece, Pos, Role, Situation }
import strategygames.go.variant.{ Go13x13, Go19x19, Go9x9, Variant }

// Licence: MIT (LiGo's own code, ADR 0006).

/** One Go game's rules state: the position, whose turn it is, the superko history and the phase.
  *
  * strategygames decides which stones are legal and what they capture (ADR 0012). This class adds what
  * docs/rules/spec.md asks for on top of it:
  *   - situations after passes count for superko (R-KO-2, open point 1); strategygames records none;
  *   - two passes open the scoring phase, where no stones or passes are played (R-SP-1);
  *   - resuming play from the scoring phase restarts the pass count (R-SP-6), so strategygames' own four-pass
  *     settlement can never happen, and is refused if no stone was placed since the previous resumption
  *     (R-SP-9);
  *   - takebacks remove the undone situations from the history (R-KO-8).
  *
  * Every value is immutable: each action returns a new game, or the reason it was refused.
  */
final class GoGame private (
    val setup: Setup,
    private val game: Game,
    val phase: Phase,
    // R-SP-9: true until the first resumption, then true again once a stone is placed.
    private val mayResume: Boolean,
    val actions: Vector[Action],
    // ADR 0020 §3: play was closed at lila's move cap; no resume.
    private val closed: Boolean = false
):
  def size: BoardSize = setup.size

  private def situation: Situation = game.situation
  private def board: Board = situation.board

  def toMove: Color = GoGame.colorOf(situation.player)

  def stones: Map[Point, Color] =
    board.pieces.map((pos, piece) => pointOf(pos) -> GoGame.colorOf(piece.player))

  def captures: Captures =
    val c = board.history.captures
    Captures(black = c.p1, white = c.p2)

  /** The ko point as R-KO-4 defines it, for display. Legality never depends on it: superko decides. */
  def koPoint: Option[Point] = board.ko.map(pointOf)

  /** Every stone of the chain the stone at `p` belongs to (R-SP-3 toggles whole chains); empty when `p` is
    * empty or off the board.
    */
  def chainAt(p: Point): Set[Point] =
    posOf(p).fold(Set.empty[Point])(pos => Chain.at(board, pos).map(pointOf))

  /** True once play was closed at the move cap ([[closePlay]]): the scoring phase can then only end. */
  def playClosed: Boolean = closed

  /** Points where the player to move may place a stone now. */
  def legalPoints: List[Point] =
    if phase == Phase.Scoring then Nil
    else board.variant.validDrops(situation).map(drop => pointOf(drop.pos))

  def play(at: Point): Either[Refusal, GoGame] =
    for
      _ <- inPlay
      pos <- posOf(at).toRight(Refusal.OffBoard)
      _ <- Either.cond(!board.pieces.contains(pos), (), Refusal.Occupied)
      played <- game.drop(Role.defaultRole, pos).toEither.left.map(_ => refusalAt(pos))
    yield next(played._1, Phase.Play, mayResume = true, Action.Place(at))

  /** A pass is always legal during play (R-MOVE-7, R-KO-3); the second in a row opens the scoring phase
    * (R-END-1).
    */
  def pass: Either[Refusal, GoGame] =
    for
      _ <- inPlay
      passed <- game.pass().toEither.left.map(_ => Refusal.InScoring)
    yield
      val after = GoGame.recordSituation(passed._1)
      val phase = if after.situation.board.consecutivePasses >= 2 then Phase.Scoring else Phase.Play
      next(after, phase, mayResume, Action.Pass)

  /** Back from the scoring phase to play (R-SP-6): the board is as after the two passes, the superko history
    * goes on, the player to move is the opponent of the second passer (strategygames' alternation already
    * gives that), and the pass count restarts.
    */
  def resume: Either[Refusal, GoGame] =
    if phase == Phase.Play then Left(Refusal.NotInScoring)
    else if closed then Left(Refusal.PlayClosed)
    else if !mayResume then Left(Refusal.ResumeLimit)
    else
      val restarted = game.copy(situation = situation.copy(board = board.copy(consecutivePasses = 0)))
      Right(GoGame(setup, restarted, Phase.Play, mayResume = false, actions :+ Action.Resume))

  /** Ends play without two passes and opens the scoring phase for good: lila calls it when a game reaches its
    * move cap (ADR 0019 §7, ADR 0020 §3). Resuming is then refused (`play-closed`), since no further move is
    * allowed; this holds too when the ply reaching the cap was itself the second pass (R-END-6). Not an
    * action: lila closes play again after replaying a capped game.
    */
  def closePlay: GoGame =
    GoGame(setup, game, Phase.Scoring, mayResume = false, actions, closed = true)

  /** An accepted takeback of the last move (R-KO-8): the game as it was before it, so the situations it
    * created leave the superko history. Not during the scoring phase, and never back past a resumption (that
    * would reopen the scoring phase).
    *
    * The earlier game is rebuilt by replaying the setup and the other actions, rather than kept, so a game
    * value holds no chain of earlier games (about 0.9 MB per 300-move 19x19 game); takebacks are rare.
    */
  def undo: Either[Refusal, GoGame] =
    if phase == Phase.Scoring then Left(Refusal.InScoring)
    else if actions.lastOption.forall(_ == Action.Resume) then Left(Refusal.NothingToUndo)
    else Right(GoGame.replay(setup, actions.init))

  def apply(action: Action): Either[Refusal, GoGame] = action match
    case Action.Place(at) => play(at)
    case Action.Pass => pass
    case Action.Resume => resume

  private def posOf(p: Point): Option[Pos] = GoGame.posOf(p, size)
  private def pointOf(pos: Pos): Point = GoGame.pointOf(pos, size)

  private def inPlay: Either[Refusal, Unit] = Either.cond(phase == Phase.Play, (), Refusal.InScoring)

  // strategygames refused a stone on an empty point: suicide, or it recreates an earlier situation
  // (simple ko included, R-KO-4).
  private def refusalAt(pos: Pos): Refusal =
    if Chain.capturesUnlessSuicide(board, situation.player, pos).isEmpty then Refusal.Suicide
    else Refusal.Superko

  private def next(after: Game, phase: Phase, mayResume: Boolean, action: Action): GoGame =
    GoGame(setup, after, phase, mayResume, actions :+ action)

  override def toString = s"GoGame(${setup.size}, ${actions.size} actions, $phase, $toMove to move)"

object GoGame:

  def start(setup: Setup): Either[SetupError, GoGame] =
    val variant = variantOf(setup.size)
    for
      _ <- Either.cond(
        0 <= setup.handicap && setup.handicap <= 9,
        (),
        SetupError.HandicapOutOfRange(setup.handicap)
      )
      _ <- Either.cond(setup.handicap < 2 || setup.position.isEmpty, (), SetupError.HandicapWithPosition)
      _ <- Either.cond(Komi.isValid(setup.komi, setup.size), (), SetupError.BadKomi(setup.komi))
      start <- startingPosition(setup, variant)
      pieces = start.stones.map((p, c) => posOf(p, setup.size).get -> Piece(playerOf(c), Role.defaultRole))
      board = Board(pieces, variant).copy(komi = setup.komi).withHistoryStartingHere(playerOf(start.toMove))
      _ <- noChainWithoutLiberties(board, setup.size)
    yield GoGame(setup, Game(Situation(board, playerOf(start.toMove))), Phase.Play, true, Vector.empty)

  // Actions this setup already accepted once; replaying them cannot be refused.
  private def replay(setup: Setup, actions: Vector[Action]): GoGame =
    val start = GoGame.start(setup).fold(e => sys.error(s"replaying a started game: ${e.message}"), identity)
    actions.foldLeft(start): (game, action) =>
      game(action).fold(r => sys.error(s"replaying an accepted action $action: ${r.key}"), identity)

  // R-HCP-2..4. Handicap stones come from strategygames' own tables; 1 stone places none.
  private def startingPosition(setup: Setup, variant: Variant): Either[SetupError, Position] =
    setup.position match
      case Some(position) =>
        position.stones.keys
          .find(!setup.size.contains(_))
          .map(SetupError.StoneOffBoard(_))
          .toLeft(position)
      case None if setup.handicap >= 2 =>
        val handicapStones = variant.fenFromSetupConfig(setup.handicap, komi = 5).pieces
        Right(Position(handicapStones.map((pos, _) => pointOf(pos, setup.size) -> Color.Black), Color.White))
      case None => Right(Position(Map.empty, Color.Black))

  private def noChainWithoutLiberties(board: Board, size: BoardSize): Either[SetupError, Unit] =
    board.pieces.keys
      .find(pos => !Chain.hasLiberty(board, Chain.at(board, pos)))
      .map(pos => SetupError.StonesWithoutLiberty(pointOf(pos, size)))
      .toLeft(())

  // Open point 1: strategygames records no situation after a pass, R-KO-2 does. The situation after
  // a pass is the same stones with the other player to move.
  private[gorules] def recordSituation(passed: Game): Game =
    val board = passed.situation.board
    val recorded = board.withHistory(board.history.afterPosition(board.positionHash(passed.situation.player)))
    passed.copy(situation = passed.situation.copy(board = recorded))

  private def variantOf(size: BoardSize): Variant = size match
    case BoardSize.Nine => Go9x9
    case BoardSize.Thirteen => Go13x13
    case BoardSize.Nineteen => Go19x19

  private def colorOf(player: Player): Color = if player == Player.P1 then Color.Black else Color.White
  private def playerOf(color: Color): Player = if color == Color.Black then Player.P1 else Player.P2

  // strategygames counts ranks from the bottom (rank 1 is the bottom row); Point counts rows from the
  // top, like SGF.
  private def posOf(p: Point, size: BoardSize): Option[Pos] =
    Option.when(size.contains(p))(Pos.at(p.col, size.lines - 1 - p.row)).flatten

  private def pointOf(pos: Pos, size: BoardSize): Point =
    Point(pos.file.index, size.lines - 1 - pos.rank.index)
