package lila.puzzle

import play.api.libs.json.{ Json, JsObject }

import lila.ui.Context
import lila.core.i18n.Translate
import lila.common.Json.given

final class PuzzleComplete(
    finisher: PuzzleFinisher,
    session: PuzzleSessionApi,
    selector: PuzzleSelector,
    replayApi: PuzzleReplayApi,
    jsonView: JsonView
)(using Executor):

  def onComplete[A](
      data: PuzzleForm.RoundData
  )(id: PuzzleId, angle: PuzzleAngle)(using
      ctx: Context
  )(using Perf, Translate): Fu[JsObject] =
    given Option[Me] = ctx.me
    lila.mon.puzzle.round.attempt(ctx.isAuth, angle.key, data.rated.yes).increment()
    ctx.me match
      case Some(me) =>
        given Me = me
        finisher(id, angle, data.win, data.rated).flatMapz { (round, perf) =>
          val newMe = me.value.withPerf(perf)
          for
            _ <- session.onComplete(me.userId, angle)
            json <-
              (data.replayDays, angle.asTheme) match
                case (Some(replayDays), Some(theme)) =>
                  for
                    _ <- replayApi.onComplete(round, replayDays, angle)
                    next <- replayApi(replayDays.some, theme)
                    json <- next match
                      case None => fuccess(Json.obj("replayComplete" -> true))
                      case Some(puzzle, replay) =>
                        jsonView.analysis(puzzle, angle, replay.some).map { nextJson =>
                          Json.obj(
                            "round" -> jsonView.roundJson.web(round, perf),
                            "next" -> nextJson
                          )
                        }
                  yield json
                case _ =>
                  for
                    next <- selector.nextPuzzleFor(angle, PuzzleDifficulty.fromReqSession(ctx.req))
                    nextJson <- next.traverse:
                      given Perf = perf
                      jsonView.analysis(_, angle, none, Me.from(newMe.user.some))
                  yield Json.obj(
                    "round" -> jsonView.roundJson.web(round, perf),
                    "next" -> nextJson
                  )
          yield json
        }
      case None =>
        finisher.incPuzzlePlays(id)
        selector
          .nextPuzzleFor(angle, PuzzleDifficulty.fromReqSession(ctx.req))
          .flatMap:
            _.so(jsonView.analysis(_, angle))
          .map: json =>
            Json.obj("next" -> json)
