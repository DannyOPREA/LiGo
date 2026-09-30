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
import scalalib.model.Days
import lila.common.HTTPRequest
import lila.common.Json.given

final class Puzzle(env: Env, apiC: => Api) extends LilaController(env):

  import env.puzzle.{ jsonView, selector }

  // The puzzle pages are a placeholder until Phase 8's Go puzzles (units 8.6 and 8.7) replace them (unit
  // 3.16): they showed chess puzzles on a chess board. The JSON API stays as it was until 8.6.
  private def comingLater(using Context) = Ok.page:
    views.site.message.comingLater(
      "Puzzles",
      "Go puzzles (tsumego) arrive in a later update."
    )

  def daily = Open:
    negotiateApi(
      html = comingLater,
      api = v =>
        Found(env.puzzle.daily.get): daily =>
          WithPuzzlePerf:
            jsonView.analysis(daily.puzzle, PuzzleAngle.mix, apiVersion = v.some).dmap { Ok(_) }
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
    JsonOk(env.puzzle.jsonView(puzzle, none, none, withInitialPos = true))

  def apiMany(idsStr: String) = AnonOrScoped(_.Web.Mobile): ctx ?=>
    val ids = idsStr.split(',').take(50).flatMap(Puz.toId).toList
    val cost =
      if ctx.isMobileOauth then ids.length / 10
      else if HTTPRequest.isLichessMobile(ctx.req) then ids.length / 5
      else ids.length
    fetchRateLimit(rateLimited, cost = cost.atLeast(1)):
      WithPuzzlePerf:
        for
          puzzles <- env.puzzle.api.puzzle.findMany(ids)
          json <- env.puzzle.jsonView.batch(puzzles)
        yield JsonOk(json)

  def home = Open(comingLater)

  def homeLang = LangPage(routes.Puzzle.home.url)(comingLater)

  def complete(angleStr: String, id: PuzzleId) = OpenBody:
    NoBot:
      onComplete(env.puzzle.forms.round)(id, PuzzleAngle.findOrMix(angleStr), mobileBc = false)

  def mobileBcRound(nid: Long) = OpenBody:
    Puz
      .numericalId(nid)
      .so:
        onComplete(env.puzzle.forms.bc.round)(_, PuzzleAngle.mix, mobileBc = true)

  private def onComplete[A](
      form: Form[PuzzleForm.RoundData]
  )(id: PuzzleId, angle: PuzzleAngle, mobileBc: Boolean)(using BodyContext[A]): Fu[Result] =
    bindForm(form)(
      doubleJsonFormError,
      data =>
        WithPuzzlePerf:
          JsonOk(env.puzzle.complete.onComplete(data)(id, angle, mobileBc))
    )

  def ofPlayer(@annotation.unused name: Option[UserStr], @annotation.unused page: Int) = Open(comingLater)

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
    negotiate(
      html = comingLater,
      json = env.puzzle.api.angles.map(angles => Ok(lila.puzzle.JsonView.angles(angles)))
    )

  def openings(@annotation.unused order: String) = Open:
    negotiate(
      html = comingLater,
      json = env.puzzle.opening.collection.map(collection => Ok(lila.puzzle.JsonView.openings(collection)))
    )

  def show(@annotation.unused angleOrId: String) = Open(comingLater)
  def showLang(language: Language, angleOrId: String) =
    LangPage(routes.Puzzle.show(angleOrId).url)(comingLater)(language)

  def showWithAngle(@annotation.unused angleKey: String, @annotation.unused id: PuzzleId) = Open(comingLater)

  def angleAndColor(@annotation.unused angleKey: String, @annotation.unused colorKey: String) =
    Open(comingLater)

  private val fetchRateLimit =
    env.security.ipTrust.rateLimit(300, 1.hour, "puzzle.fetch.ip", _.antiScraping(dch = 5, others = 1))

  def apiNext = AnonOrScoped(_.Puzzle.Read):
    fetchRateLimit(rateLimited, cost = if ctx.isAuth then 1 else 5):
      WithPuzzlePerf:
        val angle = PuzzleAngle.findOrMix(~get("angle"))
        val settings = reqSettings
        FoundOk(selector.nextPuzzleFor(angle, settings.color.map(some), settings.difficulty.some)):
          env.puzzle.jsonView(_, none, none)

  def frame = Anon:
    InEmbedContext:
      NotFound("No daily puzzle yet")

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

  def dashboard(@annotation.unused days: Days, @annotation.unused path: String = "home", u: Option[UserStr]) =
    DashboardPage(u) { ctx ?=> _ => comingLater }

  def replay(@annotation.unused days: Days, @annotation.unused themeKey: String) = Auth { ctx ?=> _ ?=>
    comingLater
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

  def history(@annotation.unused page: Int, u: Option[UserStr]) = DashboardPage(u) { ctx ?=> _ =>
    comingLater
  }

  def apiBatchSelect(angleStr: String) = AnonOrScoped(_.Puzzle.Read, _.Web.Mobile): ctx ?=>
    val nb = (getInt("nb") | 15).atLeast(1).atMost(50)
    val cost =
      if ctx.isMobileOauth then 0
      else if HTTPRequest.isLichessMobile(ctx.req) then (nb / 5).atLeast(1)
      else if ctx.isAuth then (nb / 3).atLeast(1)
      else nb
    fetchRateLimit(rateLimited, cost = cost):
      PuzzleAngle
        .find(angleStr)
        .fold(fuccess(notFoundJson(s"No $angleStr puzzles found"))): angle =>
          WithPuzzlePerf:
            for puzzles <- batchSelect(angle, reqSettings, nb)
            yield Ok(puzzles)

  private def reqSettings(using req: RequestHeader) =
    PuzzleSettings(PuzzleDifficulty.orDefault(~get("difficulty")), getColor())

  private def batchSelect(angle: PuzzleAngle, settings: PuzzleSettings, nb: Int)(using Option[Me], Perf) =
    env.puzzle.batch.nextForMe(angle, settings, nb.atMost(50)).flatMap(env.puzzle.jsonView.batch)

  private val solveRateLimit =
    env.security.ipTrust.rateLimit(400, 1.hour, "puzzle.solve.ip", _.proxyMultiplier(2))

  def apiBatchSolve(angleStr: String) = AnonOrScopedBody(parse.json)(_.Puzzle.Write, _.Web.Mobile): ctx ?=>
    if !PuzzleForm.batch.isValid(ctx.body.body)
    then BadRequest.toFuccess
    else
      ctx.body.body
        .validate[PuzzleForm.batch.SolveData]
        .fold(
          err => BadRequest(err.toString),
          data =>
            val cost = data.solutions.size * {
              if ctx.isMobileOauth then 1 else if ctx.isAuth then 2 else 5
            }
            solveRateLimit(rateLimited, cost = cost):
              val angle = PuzzleAngle.findOrMix(angleStr)
              for
                rounds <- ctx.me match
                  case Some(me) =>
                    given Me = me
                    WithPuzzlePerf:
                      for
                        solves <- env.puzzle.finisher.batch(angle, data.solutions)
                        _ <- env.puzzle.session.onComplete(me.userId, angle, solves.size)
                      yield solves.map(env.puzzle.jsonView.roundJson.api.tupled)
                  case None =>
                    data.solutions
                      .sequentiallyVoid { sol => env.puzzle.finisher.incPuzzlePlays(sol.id) }
                      .inject(Nil)
                given Option[Me] <- ctx.me.so(env.user.repo.me)
                nextPuzzles <- WithPuzzlePerf:
                  batchSelect(angle, reqSettings, ~getInt("nb"))
                result = nextPuzzles ++ Json.obj("rounds" -> rounds)
              yield Ok(result)
        )

  def mobileBcLoad(nid: Long) = Open:
    negotiateJson:
      FoundOk(Puz.numericalId(nid).so(env.puzzle.api.puzzle.find)): puz =>
        WithPuzzlePerf:
          env.puzzle.jsonView.bc(puz)

  // XHR load next play puzzle
  def mobileBcNew = Open:
    NoBot:
      negotiateApi(
        html = notFound,
        api = v =>
          val angle = PuzzleAngle.mix
          WithPuzzlePerf:
            Found(selector.nextPuzzleFor(angle, none, PuzzleDifficulty.fromReqSession(req))): p =>
              JsonOk(jsonView.analysis(p, angle, apiVersion = v.some))
      )

  /* Mobile API: select a bunch of puzzles for offline use */
  def mobileBcBatchSelect = Auth { ctx ?=> _ ?=>
    negotiateJson:
      val nb = getInt("nb").getOrElse(15).atLeast(1).atMost(30)
      WithPuzzlePerf:
        env.puzzle.batch
          .nextForMe(PuzzleDifficulty.default, nb)
          .flatMap: puzzles =>
            env.puzzle.jsonView.bc.batch(puzzles)
          .dmap(Ok(_))
  }

  /* Mobile API: tell the server about puzzles solved while offline */
  def mobileBcBatchSolve = AuthBody(parse.json) { ctx ?=> me ?=>
    negotiateJson:
      if !PuzzleForm.batch.isValid(ctx.body.body)
      then BadRequest.toFuccess
      else
        ctx.body.body
          .validate[PuzzleForm.bc.SolveDataBc]
          .fold(
            err => BadRequest(err.toString),
            data =>
              WithPuzzlePerf: perf ?=>
                data.solutions.lastOption
                  .flatMap: solution =>
                    Puz.numericalId(solution.id).map(_ -> solution.win)
                  .so: (id, solution) =>
                    env.puzzle.finisher(id, PuzzleAngle.mix, solution, chess.Rated.Yes)
                  .map:
                    case None =>
                      Ok(env.puzzle.jsonView.bc.userJson(perf.intRating))
                    case Some(round, newPerf) =>
                      env.puzzle.session.onComplete(round.userId, PuzzleAngle.mix)
                      Ok(env.puzzle.jsonView.bc.userJson(newPerf.intRating))
          )
  }

  def mobileBcVote(nid: Long) = AuthBody { ctx ?=> me ?=>
    negotiateJson:
      bindForm(env.puzzle.forms.bc.vote)(
        doubleJsonFormError,
        intVote =>
          Puz.numericalId(nid).so {
            env.puzzle.api.vote.update(_, me, intVote == 1).inject(jsonOkResult)
          }
      )
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
