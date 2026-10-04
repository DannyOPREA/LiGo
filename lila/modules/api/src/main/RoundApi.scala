package lila.api

import scalalib.data.Preload
import play.api.libs.json.*

import lila.analyse.{ Analysis, JsonView as analysisJson }
import lila.api.Context.given
import lila.common.HTTPRequest
import lila.core.perm.Granter
import lila.core.user.GameUsers
import lila.round.JsonView
import lila.tree.ExportOptions
import lila.mon.extensions.*

final private[api] class RoundApi(
    jsonView: JsonView,
    noteApi: lila.round.NoteApi,
    bookmarkApi: lila.bookmark.BookmarkApi,
    userApi: lila.user.UserApi,
    prefApi: lila.pref.PrefApi,
    userLag: lila.socket.UserLagCache
)(using Executor):

  // A game's move list is built by the browser from `game.go.moves` (unit 3.18); the chess round UI's
  // `steps`, the analysis tree, forecasts and openings went with chess games (unit 3.17).

  def player(
      pov: Pov,
      users: Preload[GameUsers]
  )(using ctx: Context): Fu[JsObject] = {
    for
      users <- users.orLoad(userApi.gamePlayers(pov.game.userIdPair, pov.game.perfKey))
      prefs <- prefApi.get(users.map(_.map(_.user)), pov.color, ctx.pref)
      (json, note, bookmarked) <-
        (
          jsonView.playerJson(pov, prefs, users, ctxFlags),
          ctx.myId.ifTrue(ctx.isMobileApi).so(noteApi.get(pov.gameId, _)),
          bookmarkApi.exists(pov.game, ctx.me)
        ).tupled
    yield (
      withNote(note)
        .compose(withBookmark(bookmarked))
        .compose(withOpponentSignal(pov))
    )(json)
  }.mon(lila.mon.round.api.player)

  def watcher(
      pov: Pov,
      users: GameUsers,
      tv: Option[lila.round.OnTv]
  )(using ctx: Context): Fu[JsObject] = {
    for (json, note, bookmarked) <-
        (
          jsonView.watcherJson(pov, users, ctx.pref.some, ctx.me, tv, ctxFlags),
          ctx.me.ifTrue(ctx.isMobileApi).so(noteApi.get(pov.gameId, _)),
          bookmarkApi.exists(pov.game, ctx.me)
        ).tupled
    yield (
      withNote(note)
        .compose(withBookmark(bookmarked))
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
      withFlags: ExportOptions,
      tv: Option[lila.round.OnTv] = None
  )(using ctx: Context): Fu[JsObject] =
    (
      jsonView.watcherJson(
        pov,
        users,
        ctx.pref.some,
        ctx.me,
        tv,
        flags = withFlags.copy(blurs = Granter.opt(_.ViewBlurs))
      ),
      ctx.me.ifTrue(ctx.isMobileApi).so(noteApi.get(pov.gameId, _)),
      bookmarkApi.exists(pov.game, ctx.me)
    ).mapN: (json, note, bookmarked) =>
      (
        withNote(note)
          .compose(withBookmark(bookmarked))
          .compose(withAnalysis(pov.game, analysis))
      )(json)
    .mon(lila.mon.round.api.watcher)

  private def withNote(note: String)(json: JsObject) =
    if note.isEmpty then json else json + ("note" -> JsString(note))

  private def withBookmark(v: Boolean)(json: JsObject) =
    json.add("bookmarked" -> v)

  private def withOpponentSignal(pov: Pov)(json: JsObject) =
    if pov.game.speed <= chess.Speed.Bullet then
      json.add("opponentSignal", pov.opponent.userId.flatMap(userLag.getLagRating))
    else json

  private def withAnalysis(g: Game, o: Option[Analysis])(json: JsObject) =
    json.add("analysis", o.map(analysisJson.bothPlayers(g.startedAtPly, _)))
