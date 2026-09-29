package views.game
package side

import lila.app.UiEnv.{ *, given }
import lila.game.GameExt.perfType

private val separator = " • "
private val dataUserTv = attr("data-user-tv")

def apply(
    pov: Pov,
    initialFen: Option[chess.format.Fen.Full],
    userTv: Option[User] = None,
    bookmarked: Boolean
)(using ctx: Context): Option[Frag] =
  // the "live stream" box went with the streamer module (unit 3.7).
  ctx.noBlind.option(meta(pov, initialFen, userTv, bookmarked))

def meta(
    pov: Pov,
    initialFen: Option[chess.format.Fen.Full],
    userTv: Option[User] = None,
    bookmarked: Boolean
)(using ctx: Context): Option[Frag] =
  ctx.noBlind.option:
    import pov.*
    div(cls := "game__meta")(
      st.section(
        div(cls := "game__meta__infos", dataIcon := ui.gameIcon(game))(
          div(cls := "header")(
            div(cls := "setup")(
              views.bookmark.toggle(game, bookmarked),
              if game.sourceIs(_.Import) then
                div(
                  a(href := routes.Importer.importGame, title := trans.site.importGame.txt())("IMPORT"),
                  separator,
                  variantLink(game.variant, game.perfType, shortName = true)
                )
              else
                frag(
                  ui.widgets.showClock(game),
                  separator,
                  ratedName(game.rated),
                  separator,
                  variantLink(game.variant, game.perfType, shortName = true)
                )
            ),
            game.pgnImport.flatMap(_.date).fold(pastMomentWithPreload(game.createdAt))(frag(_))
          ),
          game.pgnImport
            .flatMap(_.user)
            .map: importedBy =>
              small(
                trans.site.importedByX(userIdLink(importedBy.some, None, withOnline = false)),
                ctx
                  .is(importedBy)
                  .option(form(cls := "delete", method := "post", action := routes.Game.delete(game.id)):
                    submitButton(
                      cls := "button-link yes-no-confirm",
                      title := trans.site.deleteThisImportedGame.txt()
                    )(trans.site.delete.txt()))
              )
        ),
        div(cls := "game__meta__players")(
          game.players.mapList: p =>
            frag(
              div(cls := s"player color-icon is ${p.color.name} text")(
                playerLink(
                  p,
                  withOnline = false,
                  withDiff = true,
                  withBerserk = true
                )
              )
            )
        )
      ),
      game.finishedOrAborted.option(
        st.section(cls := "status")(
          ui.gameEndStatus(game),
          game.winner.map: winner =>
            frag(
              separator,
              winner.color.fold(trans.site.whiteIsVictorious, trans.site.blackIsVictorious)()
            )
        )
      ),
      game.variant.chess960.option:
        chess.variant.Chess960
          .positionNumber(initialFen | chess.format.Fen.initial)
          .map: number =>
            st.section(
              trans.site.chess960StartPosition(
                a(
                  targetBlank,
                  href := "https://chess960.net/pub/chess960-positions.pdf"
                )(number)
              )
            )
      ,
      userTv.map: u =>
        st.section(cls := "game__tv"):
          h2(cls := "top user-tv text", dataUserTv := u.id, dataIcon := Icon.AnalogTv)(u.titleUsername)
    )
