package lila.game

import chess.Color
import ligo.gorules.{ CountVersion, GameResult, GoGame, Point, Ruleset }
import play.api.libs.json.*

import lila.core.game.{ Game, GoBridge, GoScoring }
import lila.core.game.GoScoring.{ Count, Proposal, Side, Source }
import lila.game.GameExt.goPlayEnds

/** The scoring phase of a Go game (ADR 0020 §1–5, unit 4.8): what each step does to the game, as values. The
  * round stores the result, sends the request to the scoring service, publishes the events and ends the game;
  * nothing here waits or talks to Redis, so every step can be tested on its own.
  *
  * The rules of marking and accepting are go-rules' `Scoring`; the count comes from the scoring service. lila
  * only waits, keeps deadlines, and turns the accepted count into the result.
  */
object GoScoringPlay:

  /** How long lila waits for the service's proposal, or for a recount once the phase timed out (ADR 0020 §4).
    */
  def waitLimit(g: Game): FiniteDuration = if g.isCorrespondence then 1.day else 10.minutes

  /** How long the players have to agree once the proposal is in (ADR 0020 §3.6, R-SP-7). */
  def timeout(g: Game): FiniteDuration = if g.isCorrespondence then 1.day else 3.minutes

  /** A request's `ref` (ADR 0020 §1): `<gameId>:<phase>:<request>`. */
  final case class Ref(gameId: GameId, phase: Int, request: Int):
    override def toString = s"$gameId:$phase:$request"

  object Ref:
    def parse(s: String): Option[Ref] = s.split(':') match
      case Array(id, phase, request) =>
        for
          p <- phase.toIntOption
          r <- request.toIntOption
        yield Ref(GameId(id), p, r)
      case _ => None

  /** A message from the scoring service on `scoring-out` (ADR 0020 §1). */
  enum Reply:
    /** A proposal (`source` set) or a recount (`source` empty). */
    case Counted(
        ref: Ref,
        source: Option[Source],
        dead: Set[Point],
        seal: Set[Point],
        owner: String,
        count: Count
    )
    case Failed(ref: Option[Ref], message: String)
    case Start

  object Reply:

    private def points(js: JsValue): Option[Set[Point]] =
      js.asOpt[List[String]].flatMap(_.traverse(Point.fromSgf)).map(_.toSet)

    private def side(js: JsValue, white: Boolean): Option[Side] =
      for
        territory <- (js \ "territory").asOpt[Int]
        stones <- (js \ "stones").asOpt[Int]
        prisoners <- (js \ "prisoners").asOpt[Int]
        total <- (js \ "total").asOpt[BigDecimal]
        komi <- if white then (js \ "komi").asOpt[BigDecimal] else Some(BigDecimal(0))
        compensation <- if white then (js \ "compensation").asOpt[Int] else Some(0)
      yield Side(territory, stones, prisoners, komi, compensation, total)

    /** None for a message that isn't one of the service's. */
    def parse(js: JsValue): Option[Reply] =
      def ref = (js \ "ref").asOpt[String].flatMap(Ref.parse)
      (js \ "t").asOpt[String] match
        case Some("start") => Some(Start)
        case Some("error") => Some(Failed(ref, (js \ "message").asOpt[String].getOrElse("")))
        case Some(t @ ("proposal" | "count")) =>
          for
            r <- ref
            source <-
              if t == "count" then Some(None)
              else
                (js \ "src")
                  .asOpt[String]
                  .collect:
                    case "katago" => Some(Source.KataGo)
                    case "none" => Some(Source.Fallback)
            dead <- (js \ "dead").toOption.flatMap(points)
            seal <- (js \ "seal").toOption.fold(Some(Set.empty[Point]))(points)
            owner <- (js \ "owner").asOpt[String]
            black <- (js \ "score" \ "b").toOption.flatMap(side(_, white = false))
            white <- (js \ "score" \ "w").toOption.flatMap(side(_, white = true))
          yield Counted(r, source, dead, seal, owner, Count(black, white))
        case _ => None

  /** How the scoring phase ended the game: by its count (R-RES-1, `Status.VariantEnd` with the winner, or
    * none for jigo), or with no result when no count could be made (ADR 0020 §4, `Status.UnknownFinish`).
    */
  enum Ending:
    case Scored(result: GameResult)
    case NoCount

    def winner: Option[Color] = this match
      case Scored(r) => r.winningColor.map(GoBridge.color)
      case NoCount => None

  /** One step of the phase: the game before and after with its events, the request to send to the service,
    * and how the game ends, if it does.
    */
  final case class Step(progress: Progress, request: Option[JsObject] = None, ending: Option[Ending] = None):
    def game = progress.game

  private def phaseOf(g: Game) = g.go.fold(1)(GoScoring.phaseOf)

  /** The request lila is waiting on, if any: the proposal, or the recount of the current marks. lila re-sends
    * it until it is answered (ADR 0020 §1, §4).
    */
  def request(g: Game): Option[JsObject] =
    for
      go <- g.go
      sc <- g.goScoring
      if g.playable && sc.outstanding
    yield requestJson(g.id, go, sc)

  private def requestJson(id: GameId, go: GoGame, sc: GoScoring): JsObject =
    val s = go.setup
    val base = Json.obj(
      "t" -> (if sc.proposal.isEmpty then "propose" else "count"),
      "ref" -> Ref(id, GoScoring.phaseOf(go), sc.request).toString,
      "size" -> s.size.lines,
      "rules" -> (s.ruleset match
        case Ruleset.Japanese => "j"
        case Ruleset.Chinese => "c"),
      "komi" -> s.komi,
      // no stone and no compensation below 2 (R-HCP-2, R-KOMI-3, ADR 0020 §1)
      "handicap" -> (if s.handicap < 2 then 0 else s.handicap),
      "board" -> GoBridge.board(go),
      "toMove" -> (if go.toMove == ligo.gorules.Color.Black then "b" else "w"),
      "prisoners" -> Json.obj("b" -> go.captures.black, "w" -> go.captures.white)
    )
    if sc.proposal.isEmpty then base
    else base ++ Json.obj("dead" -> sc.dead.toList.sortBy(p => (p.row, p.col)).map(_.sgf))

  private def update(g: Game, sc: GoScoring): Step =
    val next = g.copy(goScoring = Some(sc))
    Step(Progress(g, next, g.go.map(Event.GoScoring(sc, _)).toList))

  /** Play stopped (two passes, or the move cap): the phase opens, the clocks stop and the proposal is asked
    * for (ADR 0020 §3.1). At the cap, play is closed so nobody can resume. None if play goes on.
    */
  def open(g: Game, now: Instant): Option[Step] =
    for
      go <- g.go
      if g.goPlayEnds && g.goScoring.isEmpty && g.playable
    yield
      val closed = if go.phase == ligo.gorules.Phase.Play then go.closePlay else go
      val sc = GoScoring.waiting(now, now.plusMillis(waitLimit(g).toMillis))
      val stopped = g
        .withGo(closed)
        .copy(clock = g.clock.map(_.stop), byoyomi = g.byoyomi.map(_.stop), goScoring = Some(sc))
      Step(Progress(g, stopped, List(Event.GoScoring(sc, closed))), Some(requestJson(g.id, closed, sc)))

  /** A message from the service for this game: the proposal or the latest recount. Anything else (a late
    * answer from before a resume or an older toggle, a duplicate) is refused with the reason.
    */
  def counted(g: Game, reply: Reply.Counted, now: Instant): Either[String, Step] =
    for
      go <- g.go.toRight("not a Go game")
      sc <- g.goScoring.filter(_ => g.playable).toRight("not in the scoring phase")
      _ <- Either.cond(
        reply.ref == Ref(g.id, GoScoring.phaseOf(go), sc.request),
        (),
        s"stale ref ${reply.ref}"
      )
      step <- (sc.proposal, reply.source) match
        case (None, Some(source)) =>
          ligo.gorules.Scoring
            .open(go, GoScoring.phaseOf(go), reply.dead, reply.ref.request)
            .left
            .map(_.key)
            .map: _ =>
              update(
                g,
                sc.copy(
                  shown = reply.ref.request,
                  proposal = Some(Proposal(reply.dead, source)),
                  dead = reply.dead,
                  seal = reply.seal,
                  owner = reply.owner,
                  count = Some(reply.count),
                  accepted = Set.empty,
                  expiresAt = now.plusMillis(timeout(g).toMillis)
                )
              )
        case (Some(_), None) =>
          for
            rules <- sc.rules(go)
            _ <- rules.counted(reply.ref.request, reply.dead).left.map(_.key)
          yield
            val step = update(
              g,
              sc.copy(shown = reply.ref.request, owner = reply.owner, count = Some(reply.count))
            )
            // the phase already timed out waiting for this recount: its marks stand (ADR 0020 §3.6)
            if sc.overtime then
              step.copy(ending = step.game.goScoring.flatMap(_.result).map(Ending.Scored(_)))
            else step
        case (None, None) => Left("a recount before the proposal")
        case (Some(_), Some(_)) => Left("a second proposal")
    yield step

  /** A player taps a stone: its whole chain flips, both acceptances go and a recount is asked for (ADR 0020
    * §3.3). `seen` is the count the player was looking at.
    */
  def toggle(g: Game, at: Point, seen: CountVersion): Either[String, Step] =
    for
      go <- g.go.toRight("not a Go game")
      sc <- g.goScoring.filter(_ => g.playable).toRight("not in the scoring phase")
      rules <- sc.rules(go)
      toggled <- rules.toggle(at, seen).left.map(_.key)
    yield
      val next = sc.copy(request = toggled.requested, dead = toggled.dead, accepted = Set.empty)
      update(g, next).copy(request = Some(requestJson(g.id, go, next)))

  /** A player accepts the count on show (ADR 0020 §3.4, R-SP-4); once both have, the game ends with it. */
  def accept(g: Game, color: Color, seen: CountVersion): Either[String, Step] =
    for
      go <- g.go.toRight("not a Go game")
      sc <- g.goScoring.filter(_ => g.playable).toRight("not in the scoring phase")
      rules <- sc.rules(go)
      accepted <- rules.accept(GoBridge.goColor(color), seen).left.map(_.key)
    yield
      val step = update(g, sc.copy(accepted = accepted.accepted))
      if accepted.agreed then step.copy(ending = sc.result.map(Ending.Scored(_)))
      else step

  /** A player takes the game back to play (ADR 0020 §3.5, R-SP-6): the marks go, the opponent of the second
    * passer moves, and the clocks run again with the time each player had. A correspondence game's time
    * restarts from now: the time spent in the phase is charged to nobody.
    */
  def resume(g: Game, now: Instant): Either[String, Step] =
    for
      go <- g.go.toRight("not a Go game")
      _ <- g.goScoring.filter(_ => g.playable).toRight("not in the scoring phase")
      resumed <- go.resume.left.map(_.key)
    yield
      val next = g
        .withGo(resumed)
        .copy(
          goScoring = None,
          clock = g.clock.map(_.start),
          byoyomi = g.byoyomi.map(_.start),
          movedAt = now
        )
      val clockEvent = next.gameClock
        .map(Event.Clock.apply)
        .orElse(next.playableCorrespondenceClock.map(Event.CorrespondenceClock.apply))
      val state = Event.State(next.ply, None, None, whiteOffersDraw = false, blackOffersDraw = false)
      Step(Progress(g, next, List(Event.GoResume(resumed, state, clockEvent))))

  /** The phase's deadline passed (ADR 0020 §3.6, §4). With no proposal, the game ends with no result. With a
    * recount pending, lila waits once more for it, then gives up the same way. Otherwise the marks on show
    * stand. None when the deadline hasn't passed.
    */
  def expire(g: Game, now: Instant): Option[Step] =
    g.goScoring
      .filter(sc => g.playable && sc.expired(now))
      .map: sc =>
        if sc.proposal.isEmpty then Step(Progress(g, g), ending = Some(Ending.NoCount))
        else if sc.pending && !sc.overtime then
          update(g, sc.copy(overtime = true, expiresAt = now.plusMillis(waitLimit(g).toMillis)))
        else if sc.pending then Step(Progress(g, g), ending = Some(Ending.NoCount))
        else Step(Progress(g, g), ending = Some(sc.result.fold(Ending.NoCount)(Ending.Scored(_))))
