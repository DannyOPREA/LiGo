package lila.game
package ui

import lila.core.game.{ Game, GoBridge, Player }
import lila.core.i18n.I18nKey
import lila.game.GameExt.*
import lila.ui.*
import lila.ui.ScalatagsTemplate.{ *, given }
import lila.game.Player.nameSplit

final class GameUi(helpers: Helpers):
  import helpers.{ *, given }

  object mini:
    private val dataState = attr("data-state")
    private val dataLive = attr("data-live")
    private val dataTime = attr("data-time")
    private val dataTimeControl = attr("data-tc")
    // LiGo (unit 3.19, mini-board slice): a Go game's mini board is drawn by ui/lib's goMini.ts.
    val boardWrap: Tag = span(cls := "go-mini")

    def apply(
        pov: Pov,
        ownerLink: Boolean = false
    )(using ctx: Context): Tag =
      renderMini(
        pov,
        gameLink(pov.game, pov.color, ownerLink),
        showRatings = ctx.pref.showRatings
      )

    def many(games: List[Game])(using Context): Frag =
      val color = chess.White
      games.map: g =>
        renderMini(g.pov(color), gameLink(g, color))

    def renderState(pov: Pov)(using me: Option[Me]) =
      val blind = me.flatMap(pov.game.player).exists(_.blindfold) && pov.game.playable
      dataState := GoBridge.miniState(pov.game.go, blind)

    private def renderMini(
        pov: Pov,
        link: String,
        showRatings: Boolean = true
    )(using Translate, Option[Me]): Tag =
      import pov.game
      a(
        href := link,
        cls := s"mini-game mini-game-${game.id} mini-game--init is2d",
        dataLive := game.isBeingPlayed.option(game.id),
        dataTimeControl := game.gameClock.fold("correspondence")(_.show),
        renderState(pov)
      )(
        renderPlayer(!pov, withRating = showRatings),
        boardWrap,
        renderPlayer(pov, withRating = showRatings)
      )

    private def renderPlayer(pov: Pov, withRating: Boolean)(using Translate) =
      span(cls := "mini-game__player")(
        span(cls := "mini-game__user")(
          playerUsername(pov.player.light, pov.player.userId.flatMap(lightUserSync), withRating = false),
          withRating.option(span(cls := "rating")(lila.game.Namer.ratingString(pov.player)))
        ),
        if pov.game.finished then renderResult(pov)
        else pov.game.clock.map { renderClock(_, pov.color) }
      )

    private def renderResult(pov: Pov) =
      span(cls := "mini-game__result"):
        pov.game.winnerColor.fold("½"): c =>
          if c == pov.color then "1" else "0"

    private def renderClock(clock: chess.Clock, color: Color) =
      val s = clock.remainingTime(color).roundSeconds.value
      span(
        cls := s"mini-game__clock mini-game__clock--${color.name}",
        dataTime := s
      ):
        f"${s / 60}:${s % 60}%02d"
  end mini

  def gameIcon(game: Game): Icon =
    if game.fromPosition then Icon.Feather
    else if game.sourceIs(_.Import) then Icon.UploadCloud
    else if game.hasAi then Icon.Cogs
    else game.perfType.icon

  def abortReason(game: Game): I18nKey =
    game.abortedBy match
      case Some(chess.White) => trans.site.whiteAborted
      case Some(chess.Black) => trans.site.blackAborted
      case None if game.playedPlies.turn.white => trans.site.whiteDidntMove
      case None => trans.site.blackDidntMove

  def gameEndStatus(game: Game)(using Translate): String =
    import chess.{ White, Black, Status as S }
    game.status match
      case S.Aborted => abortReason(game).txt()
      case S.Mate => trans.site.checkmate.txt()
      case S.Resign =>
        (if game.loser.exists(_.color.white) then trans.site.whiteResigned else trans.site.blackResigned)
          .txt()
      case S.UnknownFinish => trans.site.finished.txt()
      case S.Stalemate => trans.site.stalemate.txt()
      case S.Timeout =>
        (game.loser, game.turnColor) match
          case (Some(p), _) if p.color.white => trans.site.whiteLeftTheGame.txt()
          case (Some(_), _) => trans.site.blackLeftTheGame.txt()
          case (None, White) => trans.site.whiteLeftTheGame.txt() + " • " + trans.site.draw.txt()
          case (None, Black) => trans.site.blackLeftTheGame.txt() + " • " + trans.site.draw.txt()
      case S.Draw => trans.site.draw.txt()
      case S.InsufficientMaterialClaim =>
        trans.site.drawClaimed.txt() + " • " + trans.site.insufficientMaterial.txt()
      case S.Outoftime =>
        (game.turnColor, game.loser) match
          case (White, Some(_)) => trans.site.whiteRanOutOfTime.txt()
          case (White, None) => trans.site.whiteRanOutOfTime.txt() + " • " + trans.site.draw.txt()
          case (Black, Some(_)) => trans.site.blackRanOutOfTime.txt()
          case (Black, None) => trans.site.blackRanOutOfTime.txt() + " • " + trans.site.draw.txt()
      case S.NoStart =>
        if game.loser.exists(_.color.white) then trans.site.whiteDidntMove.txt()
        else trans.site.blackDidntMove.txt()
      case S.Cheat => trans.site.cheatDetected.txt()
      case S.VariantEnd =>
        trans.site.variantEnding.txt()
      case _ => ""

  /** `/paste`: an SGF box and a file picker (unit 7.5, ADR 0023 §2). The file is read in the browser into the
    * box (`ui/bits`' importer), so one text field is what the server gets, parsed once.
    */
  object importer:

    def apply(form: play.api.data.Form[?])(using ctx: Context) =
      Page(trans.site.importGame.txt())
        .css("bits.importer")
        .js(esmInitBit("importer"))
        .graph(
          title = trans.site.importGame.txt(),
          url = routeUrl(routes.Importer.importGame),
          description = trans.site.importGameExplanation.txt()
        ):
          main(cls := "importer page-small box box-pad")(
            h1(cls := "box__top")(trans.site.importGame()),
            p(cls := "explanation")(
              trans.site.importGameExplanation(),
              br,
              span(cls := "text", dataIcon := Icon.InfoCircle):
                trans.site.importGameDataPrivacyWarning()
            ),
            standardFlash,
            postForm(cls := "form3 import", action := routes.Importer.sendGame)(
              form3.group(form("sgf"), trans.site.goPasteSgfHere())(form3.textarea(_)()),
              form3.group(form("sgfFile"), trans.site.goOrUploadSgfFile(), klass = "upload"): f =>
                form3.file.sgf(f),
              form3.action(form3.submit(trans.site.importGame(), Icon.UploadCloud.some))
            )
          )

  object crosstable:

    def option(cross: Option[lila.game.Crosstable.WithMatchup], game: Game)(using ctx: Context) =
      cross.map: c =>
        apply(ctx.userId.fold(c)(c.fromPov), game.id.some)

    def apply(ct: Crosstable.WithMatchup, currentId: Option[GameId])(using Context): Tag =
      apply(ct.crosstable, ct.matchup, currentId)

    def apply(ct: Crosstable, trueMatchup: Option[Crosstable.Matchup], currentId: Option[GameId])(using
        Context
    ): Tag =
      val matchup = trueMatchup.filter(_.users != ct.users)
      val matchupSepAt: Option[Int] = matchup.map: m =>
        (ct.nbGames.min(Crosstable.maxGames)) - m.users.nbGames

      div(cls := "crosstable")(
        (ct.fillSize > 0).option(raw(s"""<fill style="flex:${ct.fillSize * 0.75} 1 auto"></fill>""")),
        ct.results.mapWithIndex: (r, i) =>
          tag("povs")(
            cls := List(
              "sep" -> matchupSepAt.has(i),
              "current" -> currentId.has(r.gameId)
            )
          ):
            ct.users.toList.map: u =>
              val (linkClass, text) = r.winnerId match
                case Some(w) if w == u.id => "glpt win" -> "1"
                case None => "glpt" -> "½"
                case _ => "glpt loss" -> "0"
              a(href := s"""${routes.Round.watcher(r.gameId, Color.white)}?pov=${u.id}""", cls := linkClass)(
                text
              )
        ,
        matchup.map: m =>
          div(cls := "crosstable__matchup force-ltr", title := trans.site.currentMatchScore.txt()):
            ct.users.toList.map: u =>
              span(cls := m.users.winnerId.map(w => if w == u.id then "win" else "loss"))(
                m.users.showScore(u.id)
              )
        ,
        div(cls := "crosstable__users"):
          ct.users.toList.map: u =>
            userIdLink(u.id.some, withOnline = false)
        ,
        div(cls := "crosstable__score force-ltr", title := trans.site.lifetimeScore.txt()):
          ct.users.toList.map: u =>
            span(cls := ct.users.winnerId.map(w => if w == u.id then "win" else "loss"))(ct.showScore(u.id))
      )

  object widgets:

    val separator = span(" • ")(cls := "separator")

    def apply(g: Game, user: Option[User], ownerLink: Boolean)(
        contextLink: Option[Tag]
    )(using ctx: Context): Frag =
      val fromPlayer = user.flatMap(g.player)
      val firstPlayer = fromPlayer | g.player(g.naturalOrientation)
      st.article(cls := "game-row paginated")(
        a(cls := "game-row__overlay", href := gameLink(g, firstPlayer.color, ownerLink)),
        div(cls := "game-row__board")(miniBoard(Pov(g, firstPlayer))(span)),
        div(cls := "game-row__infos")(
          div(cls := "header", dataIcon := gameIcon(g))(
            div(cls := "header__text")(
              source(g),
              g.sgfImport.flatMap(_.date).fold[Frag](pastMomentWithPreload(g.createdAt))(frag(_)),
              contextLink.map(l => frag(separator, l))
            )
          ),
          div(cls := "versus")(
            gamePlayer(g.whitePlayer),
            div(cls := "swords", dataIcon := Icon.Swords),
            gamePlayer(g.blackPlayer)
          ),
          result(g, fromPlayer),
          frag(br, br),
          g.metadata.analysed.option(
            div(cls := "metadata text", dataIcon := Icon.BarChart)(trans.site.computerAnalysisAvailable())
          ),
          g.sgfImport.flatMap(_.user).map { user =>
            div(cls := "metadata")("SGF import by ", userIdLink(user.some))
          }
        )
      )

    def miniBoard(pov: Pov)(using ctx: Context): Tag => Tag =
      val blind = ctx.me.flatMap(pov.game.player).exists(_.blindfold) && pov.game.playable
      // LiGo (unit 3.19, mini-board slice): drawn by ui/lib's goMini.ts
      _(cls := "go-mini go-mini--init", attr("data-state") := GoBridge.miniState(pov.game.go, blind))

    def source(g: Game)(using Context) =
      strong(
        if g.sourceIs(_.Import) then
          frag(
            span("IMPORT"),
            g.sgfImport.flatMap(_.user).map { user =>
              frag(" ", trans.site.by(userIdLink(user.some, None, withOnline = false)))
            },
            separator,
            perfLink(g.perfType)
          )
        else
          frag(
            showClock(g),
            separator,
            g.perfType.trans,
            separator,
            ratedName(g.rated)
          )
      )

    private def gamePlayer(player: Player)(using ctx: Context) =
      div(cls := s"player ${player.color.name}"):
        player.userId
          .flatMap: uid =>
            player.rating.map { (uid, _) }
          .map: (userId, rating) =>
            frag(
              userIdLink(userId.some, withOnline = false),
              br,
              player.berserk.option(berserkIconSpan),
              ctx.pref.showRatings.option(
                frag(
                  goRank(rating, player.provisional), // LiGo: kyu/dan (ADR 0021 §3, unit 5.5)
                  player.ratingDiff.map: d =>
                    frag(" ", showRatingDiff(d))
                )
              )
            )
          .getOrElse:
            player.aiLevel
              .map: level =>
                span(aiNameFrag(level))
              .getOrElse:
                player.nameSplit.fold(span(cls := "anon")(UserName.anonymous)): (name, rating) =>
                  frag(
                    span(name),
                    rating.map:
                      frag(br, _)
                  )

    private def result(g: Game, as: Option[Player])(using Context) = div(cls := "result")(
      if g.isBeingPlayed then trans.site.playingRightNow()
      else if g.finishedOrAborted then
        span(cls := g.winner.flatMap(w => as.map(p => if p == w then "win" else "loss")))(
          gameEndStatus(g),
          g.winner.map: winner =>
            frag(
              span(" • ")(cls := "separator"),
              winner.color.fold(trans.site.whiteIsVictorious(), trans.site.blackIsVictorious())
            )
        )
      else g.turnColor.fold(trans.site.whitePlays(), trans.site.blackPlays())
    )

    def showClock(game: Game)(using Context) =
      game.gameClock
        .map: clock =>
          frag(clock.show)
        .getOrElse:
          game.daysPerTurn
            .map: days =>
              span(title := trans.site.correspondence.txt()):
                if days.value == 1 then trans.site.oneDay()
                else trans.site.nbDays.pluralSame(days.value)
            .getOrElse:
              span(title := trans.site.unlimited.txt())("∞")
