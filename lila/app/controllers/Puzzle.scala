package controllers

import cats.mtl.Handle.*
import play.api.data.Form
import play.api.libs.json.*
import play.api.mvc.*

import lila.app.{ *, given }
import lila.core.i18n.Language
import lila.core.id.PuzzleId
import lila.puzzle.{ Puzzle as Puz, PuzzleAngle, PuzzleDifficulty, PuzzleForm, PuzzleTheme, difficultyCookie }
import lila.rating.PerfType
import scalalib.model.Days
import lila.common.HTTPRequest
import lila.common.Json.given

final class Puzzle(env: Env, apiC: => Api) extends LilaController(env):

  import env.puzzle.{ jsonView, selector }

  // The puzzle pages are a placeholder until the trainer page (unit 8.7) replaces them (unit 3.16): they
  // showed chess puzzles on a chess board. The JSON API serves Go puzzles since unit 8.6.
  private def comingLater(using Context) = Ok.page:
    views.site.message.comingLater(
      "Puzzles",
      "Go puzzles (tsumego) arrive in a later update."
    )

  def daily = Open:
    NoBot:
      negotiateApi(
        html = comingLater,
        api = _ =>
          Found(env.puzzle.daily.get): daily =>
            WithPuzzlePerf:
              jsonView.analysis(daily.puzzle, PuzzleAngle.mix).dmap { Ok(_) }
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

  def home = Open(comingLater)

  def homeLang = LangPage(routes.Puzzle.home.url)(comingLater)

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
    negotiate(
      html = comingLater,
      json = env.puzzle.api.angles.map(angles => Ok(lila.puzzle.JsonView.angles(angles)))
    )

  def show(@annotation.unused angleOrId: String) = Open(comingLater)
  def showLang(language: Language, angleOrId: String) =
    LangPage(routes.Puzzle.show(angleOrId).url)(comingLater)(language)

  def showWithAngle(@annotation.unused angleKey: String, @annotation.unused id: PuzzleId) = Open(comingLater)

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
