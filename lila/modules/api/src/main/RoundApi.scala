package lila.api

import chess.format.Fen
import chess.opening.Opening
import scalalib.data.Preload
import play.api.libs.json.*

import lila.analyse.{ Analysis, JsonView as analysisJson }
import lila.api.Context.given
import lila.common.HTTPRequest
import lila.core.perm.Granter
import lila.core.user.GameUsers
import lila.pref.Pref
import lila.round.{ Forecast, JsonView }
import lila.tree.{ ExportOptions, Tree }
import lila.mon.extensions.*

final private[api] class RoundApi(
    jsonView: JsonView,
    noteApi: lila.round.NoteApi,
    forecastApi: lila.round.ForecastApi,
    bookmarkApi: lila.bookmark.BookmarkApi,
    gameRepo: lila.game.GameRepo,
    userApi: lila.user.UserApi,
    prefApi: lila.pref.PrefApi,
    userLag: lila.socket.UserLagCache,
    divider: lila.game.Divider,
    gameOpening: lila.game.GameOpening
)(using Executor):

  def player(
      pov: Pov,
      users: Preload[GameUsers]
  )(using ctx: Context): Fu[JsObject] = {
    for
      initialFen <- gameRepo.initialFen(pov.game)
      users <- users.orLoad(userApi.gamePlayers(pov.game.userIdPair, pov.game.perfKey))
      prefs <- prefApi.get(users.map(_.map(_.user)), pov.color, ctx.pref)
      (json, note, forecast, bookmarked) <-
        (
          jsonView.playerJson(pov, prefs, users, initialFen, ctxFlags),
          ctx.myId.ifTrue(ctx.isMobileApi).so(noteApi.get(pov.gameId, _)),
          forecastApi.loadForDisplay(pov),
          bookmarkApi.exists(pov.game, ctx.me)
        ).tupled
    yield (
      withSteps(pov, initialFen)
        .compose(withNote(note))
        .compose(withBookmark(bookmarked))
        .compose(withForecastCount(forecast.map(_.steps.size)))
        .compose(withOpponentSignal(pov))
    )(json)
  }.mon(lila.mon.round.api.player)

  def watcher(
      pov: Pov,
      users: GameUsers,
      tv: Option[lila.round.OnTv],
      details: Boolean,
      initialFenO: Option[Option[Fen.Full]] = None // Preload[Option[Fen.Full]]?
  )(using ctx: Context): Fu[JsObject] = {
    for
      initialFen <- initialFenO.fold(gameRepo.initialFen(pov.game))(fuccess)
      opening = details.so(gameOpening.of(pov.game, full = ctx.isAuth))
      (json, note, bookmarked) <-
        (
          jsonView.watcherJson(pov, users, opening, ctx.pref.some, ctx.me, tv, initialFen, ctxFlags),
          ctx.me.ifTrue(ctx.isMobileApi).so(noteApi.get(pov.gameId, _)),
          bookmarkApi.exists(pov.game, ctx.me)
        ).tupled
    yield (
      withNote(note)
        .compose(withBookmark(bookmarked))
        .compose(withSteps(pov, initialFen))
    )(json)
  }.mon(lila.mon.round.api.watcher)

  private def ctxFlags(using ctx: Context) =
    ExportOptions(
      blurs = Granter.opt(_.ViewBlurs),
      rating = ctx.pref.showRatings,
      nvui = ctx.blind,
      lichobileCompat = HTTPRequest.isLichobile(ctx.req)
    )

  def review(
      pov: Pov,
      users: GameUsers,
      analysis: Option[Analysis],
      opening: Option[Opening],
      initialFen: Option[Fen.Full],
      withFlags: ExportOptions,
      tv: Option[lila.round.OnTv] = None,
      owner: Boolean = false
  )(using ctx: Context): Fu[JsObject] =
    (
      jsonView.watcherJson(
        pov,
        users,
        opening,
        ctx.pref.some,
        ctx.me,
        tv,
        initialFen = initialFen,
        flags = withFlags.copy(blurs = Granter.opt(_.ViewBlurs))
      ),
      ctx.me.ifTrue(ctx.isMobileApi).so(noteApi.get(pov.gameId, _)),
      owner.so(forecastApi.loadForDisplay(pov)),
      bookmarkApi.exists(pov.game, ctx.me)
    ).mapN: (json, note, fco, bookmarked) =>
      (
        withNote(note)
          .compose(withBookmark(bookmarked))
          .compose(withTree(pov, analysis, initialFen, withFlags))
          .compose(withAnalysis(pov.game, analysis, initialFen))
          .compose(withForecast(pov, fco))
      )(json)
    .mon(lila.mon.round.api.watcher)

  def userAnalysisJson(
      pov: Pov,
      pref: Pref,
      initialFen: Option[Fen.Full],
      orientation: Color,
      owner: Boolean,
      addLichobileCompat: Boolean = false
  )(using me: Option[Me]) =
    owner
      .so(forecastApi.loadForDisplay(pov))
      .map: fco =>
        withForecast(pov, fco):
          val opts = ExportOptions(lichobileCompat = addLichobileCompat)
          withTree(pov, analysis = none, initialFen, opts):
            jsonView.userAnalysisJson(
              pov,
              pref,
              initialFen,
              orientation,
              owner = owner,
              opening = gameOpening.of(pov.game, full = me.isDefined)
            )

  private def withTree(
      pov: Pov,
      analysis: Option[Analysis],
      initialFen: Option[Fen.Full],
      withFlags: ExportOptions
  )(obj: JsObject) =
    // A Go game's analysis tree comes with the analysis board (Phase 7); until then it has none.
    if pov.game.isGo then obj
    else
      obj + ("treeParts" ->
        Tree.makePartitionTreeJson(
          pov.game,
          analysis,
          initialFen | pov.game.variant.initialFen,
          withFlags,
          logChessError = lila.log.system.warn
        ))

  // A Go game's move list is built by the browser from `game.go.moves` (unit 3.18), which ignores these
  // steps. Until then a Go game gets the chess round UI's single starting step, so that page still loads.
  private def withSteps(pov: Pov, initialFen: Option[Fen.Full])(obj: JsObject) =
    obj + ("steps" -> lila.round.StepBuilder(
      id = pov.gameId,
      sans = pov.game.sans,
      variant = pov.game.variant,
      initialFen = initialFen | pov.game.variant.initialFen
    ))

  private def withNote(note: String)(json: JsObject) =
    if note.isEmpty then json else json + ("note" -> JsString(note))

  private def withBookmark(v: Boolean)(json: JsObject) =
    json.add("bookmarked" -> v)

  private def withForecastCount(count: Option[Int])(json: JsObject) =
    count.filter(0 !=).fold(json) { c =>
      json + ("forecastCount" -> JsNumber(c))
    }

  private def withOpponentSignal(pov: Pov)(json: JsObject) =
    if pov.game.speed <= chess.Speed.Bullet then
      json.add("opponentSignal", pov.opponent.userId.flatMap(userLag.getLagRating))
    else json

  private def withForecast(pov: Pov, fco: Option[Forecast])(json: JsObject) =
    if pov.game.forecastable then
      json + (
        "forecast" -> {
          if pov.forecastable then
            fco.fold[JsValue](Json.obj("none" -> true)) { fc =>
              import Forecast.given
              Json.toJson(fc)
            }
          else Json.obj("onMyTurn" -> true)
        }
      )
    else json

  private def withAnalysis(g: Game, o: Option[Analysis], initialFen: Option[Fen.Full])(json: JsObject) =
    json.add(
      "analysis",
      o.map { analysisJson.bothPlayers(g.startedAtPly, _, division = divider(g, initialFen)) }
    )
