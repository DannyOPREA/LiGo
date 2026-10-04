package lila.round

import play.api.i18n.Lang
import monocle.syntax.all.*

import lila.common.Bus
import lila.core.i18n.{ I18nKey as trans, Translator, defaultLang }
import lila.game.GameExt.*
import lila.game.{ Event, Progress }

final private[round] class Drawer(
    messenger: Messenger,
    finisher: Finisher
)(using Executor, Translator):

  private given Lang = defaultLang

  def apply(pov: Pov, confirm: Boolean)(using GameProxy): Fu[Events] =
    if confirm then yes(pov) else no(pov)

  def yes(pov: Pov)(using proxy: GameProxy): Fu[Events] = pov.game.drawable.so:
    pov match
      case pov if pov.opponent.isOfferingDraw =>
        finisher.other(
          pov.game,
          _.Draw,
          None,
          Messenger.SystemMessage.Persistent(trans.site.drawOfferAccepted.txt()).some
        )
      case Pov(g, color) if g.playerCanOfferDraw(color) =>
        val progress = Progress(g).map(offerDraw(color))
        messenger.system(g, color.fold(trans.site.whiteOffersDraw, trans.site.blackOffersDraw).txt())
        for
          _ <- proxy.save(progress)
          _ = publishDrawOffer(progress.game)
        yield List(Event.DrawOffer(by = color.some))
      case _ => fuccess(List(Event.ReloadOwner))

  def no(pov: Pov)(using proxy: GameProxy): Fu[Events] = pov.game.drawable.so:
    pov match
      case Pov(g, color) if pov.opponent.isOfferingDraw =>
        proxy
          .save:
            messenger.system(g, color.fold(trans.site.whiteDeclinesDraw, trans.site.blackDeclinesDraw).txt())
            Progress(g).map: g =>
              g.updatePlayer(!color, _.copy(isOfferingDraw = false))
          .inject(List(Event.DrawOffer(by = none)))
      case _ => fuccess(List(Event.ReloadOwner))
    : Fu[Events]

  // Go has no repetition draw to claim (ADR 0019 §6).
  def claim(@annotation.unused pov: Pov): Fu[Events] = fuccess(Nil)

  private def offerDraw(color: Color)(game: Game) = game
    .updatePlayer(color, _.copy(isOfferingDraw = true))
    .focus(_.metadata.drawOffers)
    .modify(_.add(color, game.ply))

  private def publishDrawOffer(game: Game): Unit = if game.nonAi then
    if game.isCorrespondence then
      Bus.pub(
        lila.core.round.CorresDrawOfferEvent(game.id)
      )
