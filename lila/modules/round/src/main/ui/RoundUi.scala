package lila.round
package ui

import lila.ui.*
import lila.ui.ScalatagsTemplate.{ *, given }

final class RoundUi(helpers: Helpers, gameUi: lila.game.ui.GameUi):
  import helpers.{ *, given }

  def RoundPage(title: String)(using ctx: Context) =
    Page(title)
      .css("round")
      .i18nOpt(ctx.speechSynthesis, _.nvui)
      .flag(_.zoom)
      .csp(_.withWebAssembly)

  def povOpenGraph(pov: Pov)(using Translate) =
    OpenGraph(
      title = titleGame(pov.game),
      url = routeUrl(routes.Round.watcher(pov.gameId, pov.color)),
      description = describePov(pov)
    )

  def others(playing: UrgentGames, simul: Option[Frag])(using Context) =
    val switchId = "round-toggle-autoswitch"
    frag(
      h3(
        simul | frag(trans.site.currentGames()),
        form3.cmnToggleWrap(st.title := trans.site.automaticallyProceedToNextGameAfterMoving.txt())(
          trans.site.autoSwitch(),
          form3.cmnToggle(switchId, switchId, checked = false)
        )
      ),
      div(cls := "now-playing"):
        val (myTurn, otherTurn) = playing.value.partition(_.isMyTurn)
        (myTurn ++ otherTurn.take(8 - myTurn.size))
          .take(12)
          .map: pov =>
            a(href := routes.Round.player(pov.fullId), cls := pov.isMyTurn.option("my_turn"))(
              span(
                cls := s"mini-game mini-game--init is2d",
                gameUi.mini.renderState(pov)
              )(gameUi.mini.boardWrap),
              span(cls := "meta")(
                playerUsername(
                  pov.opponent.light,
                  pov.opponent.userId.flatMap(lightUserSync),
                  withRating = false,
                  withTitle = true
                ),
                span(cls := "indicator")(
                  if pov.isMyTurn then
                    pov.remainingSeconds
                      .fold[Frag](trans.site.yourTurn())(secondsFromNow(_, alwaysRelative = true))
                  else nbsp
                )
              )
            )
    )

  def describePov(pov: Pov)(using Translate) =
    import pov.*
    val p1 = playerText(game.whitePlayer, withRating = true)
    val p2 = playerText(game.blackPlayer, withRating = true)
    val plays = if game.finishedOrAborted then "played" else "is playing"
    val speedAndClock =
      if game.sourceIs(_.Import) then "imported"
      else
        game.gameClock.fold(chess.Speed.Correspondence.name): c =>
          s"${c.speed.name} (${c.show})"

    val rated = game.rated.name
    import chess.Status.*
    val result = (game.winner, game.loser, game.status) match
      case (Some(w), _, Mate) => s"${playerText(w)} won by checkmate"
      case (_, _, Aborted | NoStart) => gameUi.abortReason(game).txt()
      case (_, Some(l), Resign | Timeout | Cheat | NoStart) => s"${playerText(l)} resigned"
      case (_, Some(l), Outoftime) => s"${playerText(l)} ran out of time"
      case (Some(w), _, UnknownFinish | VariantEnd) => s"${playerText(w)} won"
      case (_, _, UnknownFinish) => "The game ended with no result" // no count, not a draw (ADR 0020 §4)
      case (_, _, Draw | Stalemate) => "Game is a draw"
      case _ if game.finished => "Game ended"
      case _ => "Game is still ongoing"
    val moves = (game.ply.value - game.startedAtPly.value + 1) / 2
    s"$p1 $plays $p2 in a $rated $speedAndClock game of Go. $result after ${pluralize("move", moves)}. Click to replay, analyse, and discuss the game!"

  def roundAppPreload(pov: Pov)(using Context): Tag =
    div(cls := "round__app")(
      // The board is drawn by the page's script (unit 3.18): an empty square until then.
      div(cls := "round__app__board main-board"),
      div(cls := "col1-rmoves-preload")
    )
