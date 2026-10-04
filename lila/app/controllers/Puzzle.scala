package controllers

import cats.mtl.Handle.*
import play.api.data.Form
import play.api.libs.json.*
import play.api.mvc.*

import lila.app.{ *, given }
import lila.core.i18n.Language
import lila.core.id.PuzzleId
import lila.puzzle.{
  Puzzle as Puz,
  PuzzleAngle,
  PuzzleDifficulty,
  PuzzleForm,
  PuzzleSettings,
  PuzzleTheme,
  difficultyCookie
}
import lila.rating.PerfType
import lila.ui.LangPath
import scalalib.model.Days
import lila.common.HTTPRequest
import lila.common.Json.given

final class Puzzle(env: Env, apiC: => Api) extends LilaController(env):

  import env.puzzle.{ jsonView, selector }

  // LiGo (unit 8.7): the trainer page. The browser gets the puzzle in goban's puzzle format (unit 8.6,
  // `JsonView.puzzleJson`) and what it reads of the preferences: the coordinates and Confirm moves.
  private def renderShow(
      puzzle: Puz,
      angle: PuzzleAngle,
      replay: Option[lila.puzzle.PuzzleReplay] = None,
      langPath: Option[LangPath] = None,
      isDaily: Boolean = false
  )(using ctx: Context)(using Perf) = for
    json <- jsonView.analysis(puzzle, angle, replay)
    settings <- ctx.user.traverse(env.puzzle.session.getSettings)
    prefJson = Json.obj("coords" -> ctx.pref.coords, "confirmMoves" -> ctx.pref.confirmMoves)
    page <- renderPage:
      views.puzzle.ui
        .show(
          json ++ Json.obj("isDaily" -> isDaily),
          prefJson,
          settings | PuzzleSettings.default,
          langPath
        )
  yield Ok(page)

  def daily = Open:
    NoBot:
      Found(env.puzzle.daily.get): daily =>
        WithPuzzlePerf:
          negotiateApi(
            html = renderShow(daily.puzzle, PuzzleAngle.mix, isDaily = true),
            api = _ => jsonView.analysis(daily.puzzle, PuzzleAngle.mix).dmap { Ok(_) }
          ).dmap(_.noCache)

  def apiDaily = Anon:
    Found(env.puzzle.daily.get): daily =>
      WithPuzzlePerf:
        apiSinglePuzzle(daily.puzzle)

  def apiShow(id: PuzzleId) = Anon:
    Found(env.puzzle.api.puzzle.find(id)): puzzle =>
      WithPuzzlePerf:
        apiSinglePuzzle(puzzle)

  def apiSinglePuzzle(puzzle: Puz)(using Context, Perf) =
    JsonOk(env.puzzle.jsonView(puzzle, none, none))

  def apiMany(idsStr: String) = AnonOrScoped(_.Web.Mobile): ctx ?=>
    val ids = idsStr.split(',').take(50).flatMap(Puz.toId).toList
    val cost =
      if ctx.isMobileOauth then ids.length / 10
      else if HTTPRequest.isLichessMobile(ctx.req) then ids.length / 5
      else ids.length
    fetchRateLimit(rateLimited, cost = cost.atLeast(1)):
      for puzzles <- env.puzzle.api.puzzle.findMany(ids)
      yield JsonOk(env.puzzle.jsonView.many(puzzles))

  def home = Open(serveHome)

  def homeLang = LangPage(routes.Puzzle.home.url)(serveHome)

  private def serveHome(using Context) = NoBot:
    val angle = PuzzleAngle.mix
    WithPuzzlePerf:
      selector
        .nextPuzzleFor(angle, PuzzleDifficulty.fromReqSession(req))
        .flatMap:
          _.fold(redirectNoPuzzle):
            renderShow(_, angle, langPath = LangPath(routes.Puzzle.home).some)

  private def redirectNoPuzzle: Fu[Result] =
    Redirect(routes.Puzzle.themes).flashFailure("No more puzzles available! Try another theme.")

  def complete(angleStr: String, id: PuzzleId) = OpenBody:
    NoBot:
      onComplete(env.puzzle.forms.round)(id, PuzzleAngle.findOrMix(angleStr))

  private def onComplete[A](
      form: Form[PuzzleForm.RoundData]
  )(id: PuzzleId, angle: PuzzleAngle)(using BodyContext[A]): Fu[Result] =
    bindForm(form)(
      doubleJsonFormError,
      data =>
        WithPuzzlePerf:
          JsonOk(env.puzzle.complete.onComplete(data)(id, angle))
    )

  def vote(id: PuzzleId) = AuthBody { _ ?=> me ?=>
    NoBot:
      bindForm(env.puzzle.forms.vote)(
        doubleJsonFormError,
        vote =>
          for _ <- env.puzzle.api.vote.update(id, me, vote)
          yield jsonOkResult
      )
  }

  def report(id: PuzzleId) = AuthBody { _ ?=> me ?=>
    NoBot:
      bindForm(env.puzzle.forms.report)(
        badJsonFormError,
        reportText =>
          env.puzzle.api.puzzle
            .reportDedup(id)
            .so(env.irc.api.reportPuzzle(me.light, id, reportText))
            .inject(jsonOkResult)
      )
  }

  def apiBatchVoteThemes = SecuredScopedBody(_.PuzzleCurator)(_.Puzzle.Write) { _ ?=> me ?=>
    bindForm(env.puzzle.forms.batchVotes)(
      jsonFormError,
      _.votes
        .sequentially(puzzleVotes =>
          puzzleVotes.themes
            .sequentially: themeVote =>
              allow:
                env.puzzle.api.theme
                  .vote(puzzleVotes.puzzleId, themeVote.theme, themeVote.vote)
                  .inject(none)
              .rescue: err =>
                fuccess(Json.obj("theme" -> themeVote.theme, "msg" -> err.message).some)
            .map:
              _.flatten.map: errors =>
                Json.obj("puzzleId" -> puzzleVotes.puzzleId, "errors" -> errors)
        )
        .map(_.flatten)
        .map:
          case Nil => jsonOkResult
          case errors => BadRequest(jsonError(errors))
    )
  }

  def voteTheme(id: PuzzleId, themeStr: String) = AuthOrScopedBody(_.Puzzle.Write) { _ ?=> me ?=>
    NoBot:
      import lila.puzzle.PuzzleTheme.VoteError.*
      bindForm(env.puzzle.forms.themeVote)(
        doubleJsonFormError,
        vote =>
          allow:
            env.puzzle.api.theme.vote(id, themeStr, vote).inject(jsonOkResult)
          .rescue:
            case Fail(msg) => BadRequest(jsonError(msg))
            case Unchanged => jsonOkResult
      )
  }

  def setDifficulty(theme: String) = AuthBody { _ ?=> me ?=>
    NoBot:
      bindForm(env.puzzle.forms.difficulty)(
        doubleJsonFormError,
        diff =>
          WithPuzzlePerf:
            PuzzleDifficulty
              .find(diff)
              .so(env.puzzle.session.setDifficulty)
              .inject:
                Redirect(routes.Puzzle.show(theme))
                  .withCookies(env.security.lilaCookie.session(difficultyCookie, diff))
      )
  }

  def themes = Open(serveThemes)
  def themesLang = LangPage(routes.Puzzle.themes)(serveThemes)

  private def serveThemes(using Context) =
    env.puzzle.api.angles.flatMap: angles =>
      negotiate(
        html = Ok.page(views.puzzle.ui.themes(angles)),
        json = Ok(lila.puzzle.JsonView.angles(angles))
      )

  def show(angleOrId: String) = Open(serveShow(angleOrId))
  def showLang(language: Language, angleOrId: String) =
    LangPage(routes.Puzzle.show(angleOrId).url)(serveShow(angleOrId))(language)

  private def serveShow(angleOrId: String)(using ctx: Context) = NoBot:
    val langPath = LangPath(routes.Puzzle.show(angleOrId)).some
    WithPuzzlePerf:
      PuzzleAngle.find(angleOrId) match
        case Some(angle) =>
          selector
            .nextPuzzleFor(angle, PuzzleDifficulty.fromReqSession(req))
            .flatMap:
              _.fold(redirectNoPuzzle) { renderShow(_, angle, langPath = langPath) }
        case _ =>
          Puz.toId(angleOrId) match
            case Some(id) =>
              Found(env.puzzle.api.puzzle.find(id)): puzzle =>
                for
                  _ <- ctx.me.so { env.puzzle.api.casual.setCasualIfNotYetPlayed(_, puzzle) }
                  isDaily <- env.puzzle.daily.get.map(_.exists(_.puzzle.id == puzzle.id))
                  result <- renderShow(puzzle, PuzzleAngle.mix, langPath = langPath, isDaily = isDaily)
                yield result
            case _ => Redirect(routes.Puzzle.home).toFuccess

  def showWithAngle(angleKey: String, id: PuzzleId) = Open:
    NoBot:
      val angle = PuzzleAngle.findOrMix(angleKey)
      Found(env.puzzle.api.puzzle.find(id)): puzzle =>
        if angle.asTheme.exists(theme => !puzzle.themes.contains(theme))
        then Redirect(routes.Puzzle.show(puzzle.id.value))
        else
          WithPuzzlePerf:
            for
              _ <- ctx.me.so(env.puzzle.api.casual.setCasualIfNotYetPlayed(_, puzzle))
              res <- renderShow(puzzle, angle)
            yield res

  private val fetchRateLimit =
    env.security.ipTrust.rateLimit(300, 1.hour, "puzzle.fetch.ip", _.antiScraping(dch = 5, others = 1))

  def apiNext = AnonOrScoped(_.Puzzle.Read):
    fetchRateLimit(rateLimited, cost = if ctx.isAuth then 1 else 5):
      WithPuzzlePerf:
        val angle = PuzzleAngle.findOrMix(~get("angle"))
        val difficulty = PuzzleDifficulty.orDefault(~get("difficulty"))
        FoundOk(selector.nextPuzzleFor(angle, difficulty.some)):
          env.puzzle.jsonView(_, none, none)

  def frame = Anon:
    InEmbedContext:
      env.puzzle.daily.get.flatMap:
        _.fold(InternalServerError("No daily puzzle yet").toFuccess): p =>
          Ok.snip(views.puzzle.embed(p))

  def activity = Scoped(_.Puzzle.Read, _.Web.Mobile) { ctx ?=> me ?=>
    val config = lila.puzzle.PuzzleActivity.Config(
      user = me,
      max = getIntAs[Max]("max").map(_.atLeast(1)),
      before = getTimestamp("before"),
      since = getTimestamp("since")
    )
    apiC.GlobalConcurrencyLimitPerIpAndUserOption(me.some)(env.puzzle.activity.stream(config))(jsToNdJson)
  }

  def apiDashboard(days: Days) = AuthOrScoped(_.Puzzle.Read, _.Web.Mobile) { _ ?=> me ?=>
    JsonOptionOk:
      env.puzzle.dashboard(me, days).map2 { env.puzzle.jsonView.dashboardJson(_, days) }
  }

  def dashboard(days: Days, path: String = "home", u: Option[UserStr]) =
    DashboardPage(u) { ctx ?=> user =>
      env.puzzle.dashboard(user, days).flatMap { dashboard =>
        path match
          case "dashboard" => Ok.page(views.puzzle.dashboard.home(user, dashboard, days))
          case "improvementAreas" =>
            Ok.page(views.puzzle.dashboard.improvementAreas(user, dashboard, days))
          case "strengths" => Ok.page(views.puzzle.dashboard.strengths(user, dashboard, days))
          case _ =>
            Redirect(routes.Puzzle.dashboard(days, "dashboard", (ctx.isnt(user)).option(user.username)))
      }
    }

  def replay(days: Days, themeKey: String) = Auth { ctx ?=> me ?=>
    replayOf(days, themeKey).flatMap:
      case None => Redirect(routes.Puzzle.dashboard(days, "home", none))
      case Some((puzzle, replay), angle) => WithPuzzlePerf(renderShow(puzzle, angle, replay = replay.some))
  }

  def apiReplay(days: Days, themeKey: String) = Scoped(_.Puzzle.Read, _.Web.Mobile) { ctx ?=> me ?=>
    replayOf(days, themeKey).map:
      _.fold(notFoundJson("No puzzles to replay")):
        case ((_, replay), angle) =>
          import lila.puzzle.JsonView.given
          JsonOk(Json.obj("replay" -> replay, "angle" -> angle))
  }

  private def replayOf(days: Days, themeKey: String)(using Me) =
    val theme = PuzzleTheme.findOrMix(themeKey)
    val checkedDayOpt = lila.puzzle.PuzzleDashboard.getClosestDay(days)
    env.puzzle.replay(checkedDayOpt, theme.key).map2(_ -> PuzzleAngle(theme))

  def history(page: Int, u: Option[UserStr]) = DashboardPage(u) { _ ?=> user =>
    Reasonable(page):
      WithPuzzlePerf: perf ?=>
        Ok.async:
          env.puzzle
            .history(user.withPerf(perf), page)
            .map:
              views.puzzle.ui.history(user, _)
  }

  def help = Open:
    Ok.snip(lila.web.ui.help.puzzle)

  private def DashboardPage(username: Option[UserStr])(f: Context ?=> lila.user.User => Fu[Result]) =
    Auth { ctx ?=> me ?=>
      meOrFetch(username)
        .flatMapz: user =>
          // teachers seeing their students' dashboards went with the clas module (unit 3.6).
          fuccess((user.is(me) || isGranted(_.CheatHunter)).option(user))
        .flatMap:
          case Some(user) => f(user)
          case None => Redirect(routes.Puzzle.dashboard(Days(30), "home", none))
    }

  private def WithPuzzlePerf[A](f: Perf ?=> Fu[A])(using Option[Me]): Fu[A] =
    WithMyPerf(PerfType.Puzzle)(f)
