package ligo.gorules

// Licence: MIT (LiGo's own code, ADR 0006).

/** Which count a player was looking at: the scoring phase (1, then +1 after each resume) and the request
  * number of the count within it (ADR 0020 §1, §6). Both parts matter: request numbers start again in each
  * phase.
  */
final case class CountVersion(phase: Int, request: Int):
  override def toString = s"$phase:$request"

/** Why a scoring-phase request was refused (ADR 0020 §3). Nothing changes on a refusal. */
enum ScoringRefusal(val key: String):
  /** The game is not in the scoring phase. */
  case NotInScoring extends ScoringRefusal("not-in-scoring")

  /** A toggle on an empty point: only stones can be marked dead. */
  case NoStone extends ScoringRefusal("no-stone")

  /** The proposal marks part of a chain dead: the scoring service always names whole chains. */
  case PartialChain extends ScoringRefusal("partial-chain")

  /** A toggle or an accept made on a count that is no longer the one on show. */
  case StaleCount extends ScoringRefusal("stale-count")

  /** A recount is on its way: nothing can be toggled or accepted until it arrives. */
  case CountPending extends ScoringRefusal("count-pending")

  /** A count answered a request that isn't the latest one. */
  case NotLatest extends ScoringRefusal("not-latest")

  /** A count was made for other dead stones than the current marks. */
  case WrongMarks extends ScoringRefusal("wrong-marks")

/** One scoring phase's marks and acceptances, with the rules of R-SP-2 to R-SP-4 and ADR 0020 §3.
  *
  * The position is the game's after the two passes; this class never changes it. The count itself comes from
  * the scoring service (R-SCORE-3), so a scoring holds only which stones are marked dead, which count is on
  * show (`version`), whether a recount is pending, and who has accepted.
  *
  *   - [[Scoring.open]] takes the service's proposal: its dead stones must be whole chains.
  *   - [[toggle]] flips a whole chain (R-SP-3), clears both acceptances and asks for a recount.
  *   - [[counted]] records that the recount for the latest request arrived; it becomes the count on show.
  *   - [[accept]] records a player's acceptance of the count on show (R-SP-4); both accepted means agreed.
  *
  * Toggles and accepts name the count they were made on, so neither can land on a count the player hasn't
  * seen. Resuming play (R-SP-6) is [[GoGame.resume]]: lila then drops the scoring.
  *
  * Values are immutable: every change returns a new scoring, or the reason it was refused.
  */
final case class Scoring private (
    game: GoGame,
    /** The scoring phase's number: 1, then +1 after each resume. */
    phase: Int,
    dead: Set[Point],
    /** The request number of the count on show. */
    shown: Int,
    /** The request number of the latest request: equal to `shown` unless a recount is pending. */
    requested: Int,
    accepted: Set[Color]
):

  /** The count on show. */
  def version: CountVersion = CountVersion(phase, shown)

  def pending: Boolean = requested != shown

  def agreed: Boolean = accepted == Scoring.both

  /** Flips the chain of the stone at `at` between dead and alive. `seen` is the count the player was looking
    * at. Returns the new scoring; its `requested` is the number of the recount lila must now ask for.
    */
  def toggle(at: Point, seen: CountVersion): Either[ScoringRefusal, Scoring] =
    for
      _ <- ready(seen)
      chain = game.chainAt(at)
      _ <- Either.cond(chain.nonEmpty, (), ScoringRefusal.NoStone)
    yield
      val marked = if dead.contains(at) then dead -- chain else dead ++ chain
      copy(dead = marked, requested = requested + 1, accepted = Set.empty)

  /** The count for request `request`, made for the stones `countedDead`, arrived: it is on show from now on.
    */
  def counted(request: Int, countedDead: Set[Point]): Either[ScoringRefusal, Scoring] =
    if request != requested || !pending then Left(ScoringRefusal.NotLatest)
    else if countedDead != dead then Left(ScoringRefusal.WrongMarks)
    else Right(copy(shown = request))

  def accept(color: Color, seen: CountVersion): Either[ScoringRefusal, Scoring] =
    ready(seen).map(_ => copy(accepted = accepted + color))

  /** True when the current marks may be taken as final: when both players accepted (R-SP-4) or the phase
    * timed out (R-SP-7), provided no recount is pending.
    */
  def canFinish: Boolean = !pending

  private def ready(seen: CountVersion): Either[ScoringRefusal, Unit] =
    if pending then Left(ScoringRefusal.CountPending)
    else Either.cond(seen == version, (), ScoringRefusal.StaleCount)

object Scoring:

  private val both: Set[Color] = Set(Color.Black, Color.White)

  /** A scoring phase opened on the service's proposal (R-SP-2), answering request number `request`. The dead
    * stones must be stones of the game, and whole chains. `phase` is the scoring phase's number (ADR 0020
    * §1).
    */
  def open(
      game: GoGame,
      phase: Int,
      proposedDead: Set[Point],
      request: Int
  ): Either[ScoringRefusal, Scoring] =
    for
      _ <- Either.cond(game.phase == Phase.Scoring, (), ScoringRefusal.NotInScoring)
      _ <- Either.cond(proposedDead.forall(game.stones.contains), (), ScoringRefusal.NoStone)
      _ <- Either.cond(
        proposedDead.forall(p => game.chainAt(p).subsetOf(proposedDead)),
        (),
        ScoringRefusal.PartialChain
      )
    yield Scoring(game, phase, proposedDead, request, request, Set.empty)

/** How a finished game ended (R-END-2 to R-END-4, R-RES-1 to R-RES-3), with its SGF `RE` value (R-RES-2). */
enum GameResult:
  /** Counted: each side's total, komi and handicap compensation included (R-SCORE-4). The winner and margin
    * follow from them (R-RES-1, R-RES-3), so no impossible result can be built.
    */
  case Scored(black: BigDecimal, white: BigDecimal)
  case Resigned(winner: Color)
  case OutOfTime(winner: Color)
  case Forfeit(winner: Color)

  /** Aborted before it started, or ended with no count possible (ADR 0020 §4). */
  case NoResult

  def winningColor: Option[Color] = this match
    case Scored(b, w) => if b > w then Some(Color.Black) else if w > b then Some(Color.White) else None
    case Resigned(w) => Some(w)
    case OutOfTime(w) => Some(w)
    case Forfeit(w) => Some(w)
    case NoResult => None

  def sgf: String = this match
    case s @ Scored(b, w) =>
      s.winningColor.fold("0"): c =>
        s"${GameResult.letter(c)}+${(b - w).abs.bigDecimal.stripTrailingZeros.toPlainString}"
    case Resigned(w) => s"${GameResult.letter(w)}+R"
    case OutOfTime(w) => s"${GameResult.letter(w)}+T"
    case Forfeit(w) => s"${GameResult.letter(w)}+F"
    case NoResult => "Void"

object GameResult:

  /** R-RES-1: the higher total wins by the difference; equal totals are jigo (R-RES-3). The totals are the
    * scoring service's, komi and handicap compensation included (R-SCORE-4).
    */
  def fromTotals(black: BigDecimal, white: BigDecimal): GameResult = Scored(black, white)

  private[gorules] def letter(color: Color): String = if color == Color.Black then "B" else "W"
