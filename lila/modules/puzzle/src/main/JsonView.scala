package lila.puzzle

import chess.rating.IntRatingDiff
import scalalib.model.Days
import play.api.libs.json.*

import lila.common.Json.given
import lila.core.i18n.Translate

final class JsonView:

  import JsonView.{ *, given }

  // LiGo (ADR 0025 section 1): the browser gets the puzzle in goban's own puzzle format, under "puzzle".
  // There is no "game": a generated puzzle comes from no game.
  def apply(
      puzzle: Puzzle,
      angle: Option[PuzzleAngle],
      replay: Option[PuzzleReplay]
  )(using Translate)(using Option[Me], Perf): Fu[JsObject] = fuccess:
    Json
      .obj("puzzle" -> puzzleJson(puzzle))
      .add("user" -> userJson)
      .add("replay" -> replay.map(replayJson))
      .add("angle" -> angle.map(Json.toJsObject(_)))

  // /api/puzzle/many: lichess's {puzzles: [{game, puzzle}]} without the games
  def many(puzzles: Seq[Puzzle]): JsObject =
    Json.obj("puzzles" -> puzzles.map(p => Json.obj("puzzle" -> puzzleJson(p))))

  // LiGo: lichess's `apiVersion` parameter chose its mobile app's old format; LiGo has no mobile app.
  def analysis(
      puzzle: Puzzle,
      angle: PuzzleAngle,
      replay: Option[lila.puzzle.PuzzleReplay] = None,
      newMe: Option[Me] = None
  )(using oldMe: Option[Me])(using Perf, Translate): Fu[JsObject] =
    given me: Option[Me] = newMe.orElse(oldMe)
    apply(puzzle, angle.some, replay)

  def userJson(using perf: Perf, me: Option[Me]) = me.isDefined.option:
    Json
      .obj("rating" -> perf.intRating)
      .add("provisional" -> perf.provisional)

  private def replayJson(r: PuzzleReplay) =
    Json.obj("days" -> r.days, "i" -> r.i, "of" -> r.nb)

  object roundJson:
    def web(round: PuzzleRound, perf: Perf)(using prevPerf: Perf) =
      base(round, (perf.intRating - prevPerf.intRating).into(IntRatingDiff))
        .add("vote" -> round.vote)
        .add("themes" -> round.nonEmptyThemes.map: rt =>
          JsObject:
            rt.map: t =>
              t.theme.value -> JsBoolean(t.vote))

    def api = base
    private def base(round: PuzzleRound, ratingDiff: IntRatingDiff) = Json.obj(
      "id" -> round.id.puzzleId,
      "win" -> round.win,
      "ratingDiff" -> ratingDiff
    )

  def dashboardJson(dash: PuzzleDashboard, days: Days)(using Translate) = Json.obj(
    "days" -> days,
    "global" -> dashboardResults(dash.global),
    "themes" -> JsObject(dash.byTheme.toList.sortBy(-_._2.nb).map { (key, res) =>
      key.value -> Json.obj(
        "theme" -> PuzzleTheme(key).name.txt(),
        "results" -> dashboardResults(res)
      )
    })
  )

  private def dashboardResults(res: PuzzleDashboard.Results) = Json.obj(
    "nb" -> res.nb,
    "firstWins" -> res.firstWins,
    "replayWins" -> res.fixed,
    "puzzleRatingAvg" -> res.puzzleRatingAvg,
    "performance" -> res.performance
  )

object JsonView:

  given (using Translate): OWrites[PuzzleAngle] = a =>
    Json
      .obj(
        "key" -> a.key,
        "name" -> {
          if a == PuzzleAngle.mix
          then lila.core.i18n.I18nKey.puzzle.puzzleThemes.txt()
          else a.name.txt()
        },
        "desc" -> a.description.txt()
      )

  given OWrites[PuzzleReplay] = Json.writes[PuzzleReplay]

  /** The fields of every puzzle JSON: lila's own, and LiGo's `goal` and `source`. */
  def puzzleJsonBase(puzzle: Puzzle): JsObject = Json.obj(
    "id" -> puzzle.id,
    "rating" -> puzzle.glicko.intRating,
    "plays" -> puzzle.plays,
    "themes" -> puzzle.themes,
    "goal" -> puzzle.goal,
    "source" -> puzzle.source
  )

  /** goban's puzzle config (ADR 0025 section 1, `Puzzle` in libs/board/src/puzzle.ts): the names are goban's,
    * and `move_tree` is the stored tree as it is.
    */
  def puzzleJson(puzzle: Puzzle): JsObject =
    puzzleJsonBase(puzzle) ++ Json
      .obj(
        "width" -> puzzle.size,
        "height" -> puzzle.size,
        "initial_state" -> Json.obj("black" -> puzzle.setup.black, "white" -> puzzle.setup.white),
        "initial_player" -> puzzle.color.name,
        "move_tree" -> lila.db.JSON.jval(puzzle.tree),
        "puzzle_player_move_mode" -> "free",
        "puzzle_opponent_move_mode" -> "automatic"
      )
      .add(
        "bounds" -> puzzle.bounds
          .map(b => Json.obj("top" -> b.top, "left" -> b.left, "bottom" -> b.bottom, "right" -> b.right))
      )

  // the activity stream: the puzzle's facts, without its board or tree
  def puzzleJsonStandalone(puzzle: Puzzle): JsObject = puzzleJsonBase(puzzle)

  def angles(all: PuzzleAngle.All)(using Translate) = Json.obj(
    "themes" -> JsObject:
      all.themes.map: (i18n, themes) =>
        i18n.txt() -> JsArray:
          themes.map:
            case PuzzleTheme.WithCount(theme, count) =>
              Json.obj(
                "key" -> theme.key,
                "name" -> theme.name.txt(),
                "desc" -> theme.description.txt(),
                "count" -> count
              )
  )
