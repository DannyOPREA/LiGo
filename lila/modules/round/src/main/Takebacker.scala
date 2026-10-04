package lila.round

import chess.{ ByColor, Color, Ply }
import alleycats.Zero
import scalalib.data.Preload

import lila.common.Bus
import lila.core.i18n.{ I18nKey as trans, Translator, defaultLang }
import lila.core.round.*
import lila.game.{ Event, Progress, Rewind }
import lila.pref.{ Pref, PrefApi }

private final class TakebackState(nbDeclined: Int, lastDeclined: Option[Instant]):
  def decline = TakebackState(nbDeclined + 1, nowInstant.some)
  def offerable = lastDeclined.forall { _.isBefore(nowInstant.minusSeconds(delaySeconds)) }
  private def delaySeconds = (math.pow(nbDeclined.min(10), 2) * 10).toInt

private type TakebackBoard = ByColor[TakebackState]

private given takebackBoardZero: Zero[TakebackBoard] = Zero(ByColor.fill(TakebackState(0, none)))

final private class Takebacker(
    messenger: Messenger,
    prefApi: PrefApi
)(using Executor, Translator):

  private given play.api.i18n.Lang = defaultLang

  def apply(board: TakebackBoard)(pov: Pov, confirm: Boolean)(using
      proxy: GameProxy
  ): Fu[(Events, TakebackBoard)] =
    if confirm then yes(board)(pov) else no(board)(pov)

  private def canProposeTakeback(pov: Pov) =
    import pov.game.{ pov as _, * }
    started && playable && !isTournament && !isSimul &&
    bothPlayersHaveMoved &&
    !player(pov.color).isProposingTakeback &&
    !opponent(pov.color).isProposingTakeback

  def yes(board: TakebackBoard)(pov: Pov)(using proxy: GameProxy): Fu[(Events, TakebackBoard)] =
    IfAllowed(pov.game, Preload.none):
      pov match
        case Pov(game, color) if pov.opponent.isProposingTakeback =>
          for events <- rewind(
              pov,
              Takebacker.acceptedPlies(
                currentPly = game.ply,
                proposedAt = pov.opponent.proposeTakebackAt,
                accepter = color,
                playedPlies = game.playedPlies
              )
            )
          yield events -> takebackBoardZero.zero
        case pov if canProposeTakeback(pov) && board(pov.color).offerable =>
          messenger.volatile(pov.game, offerTakebackMessage(pov))
          val progress = Progress(pov.game).map: g =>
            g.updatePlayer(pov.color, _.copy(proposeTakebackAt = g.ply))
          for
            _ <- proxy.save(progress)
            _ = publishTakebackOffer(progress.game)
            events = List(Event.TakebackOffers(pov.color.white, pov.color.black))
          yield events -> board
        case _ => fufail(ClientError("[takebacker] invalid yes " + pov))

  def no(board: TakebackBoard)(pov: Pov)(using proxy: GameProxy): Fu[(Events, TakebackBoard)] =
    pov match
      case Pov(game, color) if pov.player.isProposingTakeback =>
        messenger.volatile(
          game,
          pov.color.fold(trans.site.whiteCancelsTakeback, trans.site.blackCancelsTakeback).txt()
        )
        val progress = Progress(game).map: g =>
          g.updatePlayer(color, _.removeTakebackProposition)
        for
          _ <- proxy.save(progress)
          _ = publishTakebackOffer(progress.game)
          events = List(Event.TakebackOffers(white = false, black = false))
        yield events -> board.update(color, _.decline)
      case Pov(game, color) if pov.opponent.isProposingTakeback =>
        messenger.volatile(
          game,
          pov.color.fold(trans.site.whiteDeclinesTakeback, trans.site.blackDeclinesTakeback).txt()
        )
        val progress = Progress(game).map: g =>
          g.updatePlayer(!color, _.removeTakebackProposition)
        for
          _ <- proxy.save(progress)
          _ = publishTakebackOffer(progress.game)
          events = List(Event.TakebackOffers(white = false, black = false))
        yield events -> board.update(!color, _.decline)
      case _ => fufail(ClientError("[takebacker] invalid no " + pov))

  def isAllowedIn(game: Game, prefs: Preload[ByColor[Pref]]): Fu[Boolean] =
    game.canTakebackOrAddTime.so(isAllowedByPrefs(game, prefs))

  private def offerTakebackMessage(pov: Pov): String =
    val k = if pov.game.turnOf(pov.color) then 2 else 1
    goTakebackMessage(pov, k, pov.game.go)

  // Go moves are numbered 1, 2, 3… in play order: "Black proposes takeback (4. ee 5. cc)".
  private def goTakebackMessage(pov: Pov, k: Int, go: ligo.gorules.GoGame): String =
    val first = pov.game.playedPlies.value - k + 1
    val moves = go.actions
      .takeRight(k)
      .zipWithIndex
      .map: (a, i) =>
        s"${first + i}. ${lila.core.game.GoBridge.token(a)}"
    val base = pov.color.fold(trans.site.whiteProposesTakeback, trans.site.blackProposesTakeback).txt()
    s"$base (${moves.mkString(" ")})"

  private def isAllowedByPrefs(game: Game, prefs: Preload[ByColor[Pref]]): Fu[Boolean] =
    if game.hasAi then fuTrue
    else
      prefs
        .orLoad:
          prefApi.byId(game.userIdPair)
        .dmap:
          _.forall: p =>
            p.takeback == Pref.Takeback.ALWAYS || (p.takeback == Pref.Takeback.CASUAL && game.rated.no)

  private def IfAllowed[A](game: Game, prefs: Preload[ByColor[Pref]])(f: => Fu[A]): Fu[A] =
    if !game.playable then fufail(ClientError("[takebacker] game is over " + game.id))
    else if !game.canTakebackOrAddTime then fufail(ClientError("[takebacker] game disallows it " + game.id))
    else
      isAllowedByPrefs(game, prefs).flatMap:
        if _ then f
        else fufail(ClientError("[takebacker] disallowed by preferences " + game.id))

  private def rewind(pov: Pov, plies: Int)(using GameProxy): Fu[Events] =
    // go-rules' undo, one action at a time (ADR 0019 §6)
    (1 to plies)
      .foldLeft[Either[String, Progress]](Right(Progress(pov.game))): (prev, _) =>
        prev.flatMap(prog => Rewind.go(prog.game).map(rewinded => prog.withGame(rewinded.game)))
      .fold(e => fufail(ClientError(s"[takebacker] $e")), saveAndNotify(_, pov))

  private def saveAndNotify(p1: Progress, pov: Pov)(using proxy: GameProxy): Fu[Events] =
    val p2 = p1 + Event.Reload
    val accepter = if pov.opponent.isProposingTakeback then pov.color else !pov.color
    messenger.system(
      p2.game,
      accepter.fold(trans.site.whiteAcceptsTakeback, trans.site.blackAcceptsTakeback).txt()
    )
    proxy.save(p2).inject(p2.events)

  private def publishTakebackOffer(game: Game): Unit =
    if game.isCorrespondence && game.nonAi then
      Bus.pub(
        lila.core.round.CorresTakebackOfferEvent(game.id)
      )

private object Takebacker:
  def acceptedPlies(currentPly: Ply, proposedAt: Ply, accepter: Color, playedPlies: Ply): Int =
    val proposedPlies = if accepter == proposedAt.turn then 1 else 2
    (currentPly - proposedAt + proposedPlies).atLeast(1).atMost(playedPlies).value
