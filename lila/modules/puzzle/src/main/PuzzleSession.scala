package lila.puzzle

import lila.memo.CacheApi
import chess.IntRating

private case class PuzzleSession(
    settings: PuzzleSettings,
    path: PuzzlePath.Id,
    positionInPath: Int,
    rating: IntRating,
    previousPaths: Set[PuzzlePath.Id] = Set.empty
):
  def switchTo(pathId: PuzzlePath.Id) = copy(
    path = pathId,
    previousPaths = previousPaths + pathId,
    positionInPath = 0
  )
  def forward(nb: Int) = copy(positionInPath = positionInPath + nb)
  def next = forward(1)

  def brandNew = positionInPath == 0

  def similarTo(other: PuzzleSession) =
    path.angle == other.path.angle &&
      settings.difficulty == other.settings.difficulty

  override def toString = s"$path:$positionInPath($settings)"

// LiGo (ADR 0025 section 3): lichess let a session also pick a colour, in opening angles only. A Go
// puzzle's colour is part of the puzzle, so a session only has a difficulty.
case class PuzzleSettings(difficulty: PuzzleDifficulty)
object PuzzleSettings:
  val default = PuzzleSettings(PuzzleDifficulty.default)

final class PuzzleSessionApi(pathApi: PuzzlePathApi, cacheApi: CacheApi)(using Executor):

  def onComplete(userId: UserId, angle: PuzzleAngle, nb: Int = 1): Funit =
    sessions
      .getIfPresent(userId)
      .so:
        _.map: session =>
          // yes, even if the completed puzzle was not the current session puzzle
          // in that case we just skip a puzzle on the path, which doesn't matter
          if session.path.angle == angle then sessions.put(userId, fuccess(session.forward(nb)))

  def getSettings(user: User): Fu[PuzzleSettings] =
    sessions
      .getIfPresent(user.id)
      .fold[Fu[PuzzleSettings]](fuccess(PuzzleSettings.default))(_.dmap(_.settings))

  def setDifficulty(difficulty: PuzzleDifficulty)(using Me, Perf): Funit =
    updateSession: prev =>
      prev
        .forall(_.settings.difficulty != difficulty)
        .option(
          createSessionFor("difficulty")(
            prev.map(_.path.angle) | PuzzleAngle.mix,
            PuzzleSettings(difficulty)
          )
        )

  private[puzzle] def set(session: PuzzleSession)(using me: Me) = sessions.put(me.userId, fuccess(session))

  private def updateSession(f: Option[PuzzleSession] => Option[Fu[PuzzleSession]])(using me: Me): Funit =
    sessions
      .getIfPresent(me.userId)
      .fold(fuccess(none[PuzzleSession]))(_.dmap(some))
      .flatMap: prev =>
        f(prev).so:
          _.map: next =>
            (!prev.exists(next.similarTo)).so(sessions.put(me.userId, fuccess(next)))

  private val sessions = cacheApi.notLoading[UserId, PuzzleSession](16_384, "puzzle.session"):
    _.expireAfterWrite(1.hour).buildAsync()

  private[puzzle] def continueOrCreateSessionFor(
      angle: PuzzleAngle,
      canFlush: Boolean
  )(using me: Me, perf: Perf): Fu[PuzzleSession] =
    sessions
      .getFuture(me.userId, _ => createSessionFor("miss")(angle, PuzzleSettings.default))
      .flatMap: current =>
        val reCreateReason =
          if current.path.angle != angle then "wrongAngle".some
          else if canFlush && shouldFlushSession(current) then "flush".some
          else none
        reCreateReason match
          case Some(reason) =>
            createSessionFor(reason)(angle, current.settings).tap { sessions.put(me.userId, _) }
          case None => fuccess(current)

  // renew the session often for provisional players
  private def shouldFlushSession(session: PuzzleSession)(using perf: Perf) = !session.brandNew && {
    Math.abs((perf.intRating - session.rating).value) > 100
  }

  private def createSessionFor(reason: String)(angle: PuzzleAngle, settings: PuzzleSettings)(using
      me: Me,
      perf: Perf
  ): Fu[PuzzleSession] =
    pathApi
      .nextFor(s"session.$reason")(angle, PuzzleTier.top, settings.difficulty, Set.empty)
      .orFail(s"No puzzle path found for ${me.username}, angle: $angle")
      .map(pathId => PuzzleSession(settings, pathId, 0, perf.intRating))
