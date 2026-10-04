package lila.core
package game

import ligo.gorules.{ Action, Color as GoColor, CountVersion, GameResult, GoGame, Point, Scoring }

/** A Go game's scoring phase as lila keeps it (ADR 0020 §2, the `sc` subdocument): opened by two passes or
  * the move cap, waiting for the scoring service's proposal, then the dead stones the players toggle, the
  * count on show and who accepted it. The rules of toggling and accepting are go-rules' [[Scoring]]; this
  * adds the waiting, the deadlines and the count itself, which only the scoring service makes (lila never
  * counts).
  *
  * It stays on a finished game as the record of its count; resuming play removes it.
  *
  * @param request
  *   the latest request number sent to the service in this phase (`q`, the third part of `ref`)
  * @param shown
  *   the request number of the count on show (`cv`); 0 before the proposal
  * @param expiresAt
  *   when the phase times out, or, before the proposal or while a late recount is awaited, when lila stops
  *   waiting for the service (`ex`, ADR 0020 §3.6, §4)
  * @param overtime
  *   the timeout passed while a recount was pending: the recount ends the game as soon as it arrives (`tx`,
  *   unit 4.8)
  */
final case class GoScoring(
    opened: Instant,
    request: Int,
    shown: Int,
    proposal: Option[GoScoring.Proposal],
    dead: Set[Point],
    seal: Set[Point],
    owner: String,
    count: Option[GoScoring.Count],
    accepted: Set[GoColor],
    expiresAt: Instant,
    overtime: Boolean
):
  def pending: Boolean = request != shown

  /** Waiting for the scoring service: no proposal yet, or a recount on its way. */
  def outstanding: Boolean = proposal.isEmpty || pending

  def expired(now: Instant): Boolean = !now.isBefore(expiresAt)

  /** The players' view of the count on show: `<phase>:<request>` (ADR 0020 §6). */
  def version(phase: Int): CountVersion = CountVersion(phase, shown)

  /** go-rules' scoring for this state, or why the stored state doesn't fit the game. */
  def rules(go: GoGame): Either[String, Scoring] =
    proposal
      .toRight("no proposal yet")
      .flatMap: _ =>
        Scoring
          .restore(go, GoScoring.phaseOf(go), dead, shown, request, accepted)
          .left
          .map(_.key)

  def result: Option[GameResult] = count.map(c => GameResult.fromTotals(c.black.total, c.white.total))

object GoScoring:

  enum Source(val key: String):
    case KataGo extends Source("k")
    case Fallback extends Source("n")

  /** The dead stones the scoring service proposed first, never recomputed (`pd`, `src`). */
  final case class Proposal(dead: Set[Point], source: Source)

  /** One side's count, as the scoring service made it (ADR 0020 §1). Black's `komi` and `compensation` are
    * always 0.
    */
  final case class Side(
      territory: Int,
      stones: Int,
      prisoners: Int,
      komi: BigDecimal,
      compensation: Int,
      total: BigDecimal
  )
  final case class Count(black: Side, white: Side)

  /** The scoring phase's number (ADR 0020 §1): 1, then one more after each resume. */
  def phaseOf(go: GoGame): Int = 1 + go.actions.count(_ == Action.Resume)

  def waiting(now: Instant, expiresAt: Instant): GoScoring =
    GoScoring(now, 1, 0, None, Set.empty, Set.empty, "", None, Set.empty, expiresAt, overtime = false)
