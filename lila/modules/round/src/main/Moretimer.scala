package lila.round

import chess.{ ByColor, Centis, Color }

import scalalib.data.Preload
import lila.core.game.GoBridge
import lila.game.GameExt.{ withByoyomi, withClock }
import lila.game.{ Event, Progress }
import lila.pref.{ Pref, PrefApi }

final class Moretimer(messenger: Messenger, prefApi: PrefApi):

  private val minTime = 5.seconds
  private val maxTime = 60.seconds

  // pov of the player giving more time
  def apply(pov: Pov, duration: FiniteDuration, force: Boolean): Fu[Option[Progress]] =
    isAllowedIn(pov.game, Preload.none, force).mapz:
      if pov.game.gameClock.exists(_.moretimeable(!pov.color))
      then give(pov.game, List(!pov.color), duration).some
      else if pov.game.correspondenceClock.exists(_.moretimeable(!pov.color))
      then
        messenger.volatile(pov.game, s"${!pov.color} gets more time")
        val p = Progress(pov.game, pov.game.copy(movedAt = nowInstant))
        p.game.correspondenceClock.map(Event.CorrespondenceClock.apply).foldLeft(p)(_ + _).some
      else none

  def isAllowedIn(game: Game, prefs: Preload[ByColor[Pref]], force: Boolean): Fu[Boolean] =
    (game.playable && !game.isUnlimited && game.canTakebackOrAddTime).so:
      if force then fuccess(true)
      else (!game.hasRule(_.noGiveTime)).so(isAllowedByPrefs(game, prefs))

  private[round] def give(
      game: Game,
      colors: List[Color],
      unchecked: FiniteDuration,
      reboot: Boolean = false
  ): Progress =
    if !game.hasClock then Progress(game)
    else
      val duration =
        if unchecked < minTime then minTime
        else if unchecked > maxTime then maxTime
        else unchecked
      colors.foreach: c =>
        messenger.volatile(game, s"$c + ${duration.toSeconds} seconds", reboot = reboot)
      addTime(game, colors.map(_ -> duration.toCentis))

  /** Adds time to whichever clock the game has. A byo-yomi clock adds it to main time, or to the current
    * period once in byo-yomi (go-rules' `giveTime`), and sends the whole clock, since the browsers' "clock
    * increment" event only knows Fischer clocks.
    */
  private[round] def addTime(game: Game, times: List[(Color, Centis)]): Progress =
    game.clock
      .map: clock =>
        val newClock = times.foldLeft(clock) { case (c, (color, centis)) => c.giveTime(color, centis) }
        game.withClock(newClock) ++ times.map((color, centis) => Event.ClockInc(color, centis, newClock))
      .orElse:
        game.byoyomi.map: clock =>
          val newClock = times.foldLeft(clock) { case (c, (color, centis)) =>
            c.giveTime(GoBridge.goColor(color), centis.centis).getOrElse(c)
          }
          game.withByoyomi(newClock) + Event.Clock(newClock)
      .getOrElse(Progress(game))

  private def isAllowedByPrefs(game: Game, prefs: Preload[ByColor[Pref]]): Fu[Boolean] =
    prefs
      .orLoad:
        prefApi.byId(game.userIdPair)
      .dmap:
        _.forall: p =>
          p.moretime == Pref.Moretime.ALWAYS || (p.moretime == Pref.Moretime.CASUAL && game.rated.no)
