package lila.game

import chess.rating.IntRatingDiff
import chess.{ ByColor, Centis, Clock as ChessClock, Color, Ply, Status }
import play.api.libs.json.*

import lila.common.Json.given
import lila.core.game.{ Event, Game, GameClock, GoBridge }

import JsonView.given

object Event:

  sealed trait Empty extends Event:
    def data = JsNull

  object Start extends Empty:
    def typ = "start"

  /** A Go move (ADR 0019 §6): a stone (`p`, an SGF point) or a pass, with what the browser needs to follow
    * the game without the rules: the points it captured, both players' prisoners, the ko point, the phase and
    * the board for live mini boards. No `dests`: the browser's goban engine knows the legal points and the
    * server re-checks.
    */
  case class GoMove(
      action: ligo.gorules.Action,
      by: Color,
      captured: List[ligo.gorules.Point],
      go: ligo.gorules.GoGame,
      state: State,
      clock: Option[ClockEvent]
  ) extends Event:
    def typ = "move"
    def data =
      val move = action match
        case ligo.gorules.Action.Place(at) => Json.obj("p" -> at.sgf)
        case _ => Json.obj("pass" -> true)
      move ++ Json
        .obj(
          "ply" -> state.turns,
          "cap" -> captured.map(_.sgf),
          "prisoners" -> Json.obj("b" -> go.captures.black, "w" -> go.captures.white),
          "phase" -> (if go.phase == ligo.gorules.Phase.Play then "play" else "scoring"),
          "board" -> lila.core.game.GoBridge.board(go)
        )
        .add("ko" -> go.koPoint.map(_.sgf))
        .add("clock" -> clock.map(_.data))
        .add("status" -> state.status)
        .add("winner" -> state.winner)
    override def moveBy = Some(by)

  case class RedirectOwner(
      color: Color,
      id: GameFullId,
      cookie: Option[JsObject]
  ) extends Event:
    def typ = "redirect"
    def data =
      Json
        .obj(
          "id" -> id,
          "url" -> s"/$id"
        )
        .add("cookie" -> cookie)
    override def only = Some(color)

  case class PlayerMessage(data: JsObject) extends Event:
    def typ = "message"
    override def owner = true
    override def troll = false

  case class UserMessage(data: JsObject, override val troll: Boolean, w: Boolean) extends Event:
    def typ = "message"
    override def watcher = w
    override def owner = !w

  case class EndData(game: Game, ratingDiff: Option[chess.ByColor[IntRatingDiff]]) extends Event:
    def typ = "endData"
    def data =
      Json
        .obj(
          "winner" -> game.winnerColor,
          "status" -> game.status
        )
        .add("abortedBy" -> game.abortedBy)
        .add("clock" -> game.gameClock.map: c =>
          Json.obj(
            "wc" -> c.remainingTime(Color.White).centis,
            "bc" -> c.remainingTime(Color.Black).centis
          ))
        .add("ratingDiff" -> ratingDiff.map: rds =>
          Json.obj(
            Color.White.name -> rds.white,
            Color.Black.name -> rds.black
          ))
        .add("boosted" -> game.boosted)

  case object Reload extends Empty:
    def typ = "reload"
  case object ReloadOwner extends Empty:
    def typ = "reload"
    override def owner = true

  private def reloadOr[A: Writes](typ: String, data: A) = Json.obj("t" -> typ, "d" -> data)

  // use t:reload for mobile app BC,
  // but send extra data for the web to avoid reloading
  case class RematchOffer(by: Option[Color]) extends Event:
    def typ = "reload"
    def data = reloadOr("rematchOffer", by)
    override def owner = true

  case class RematchTaken(nextId: GameId) extends Event:
    def typ = "reload"
    def data = reloadOr("rematchTaken", nextId)

  case class DrawOffer(by: Option[Color]) extends Event:
    def typ = "reload"
    def data = reloadOr("drawOffer", by)

  case class ClockInc(color: Color, time: Centis, newClock: ChessClock) extends Event:
    def typ = "clockInc"
    def data =
      Json.obj(
        "color" -> color,
        "time" -> time.centis,
        "total" -> newClock.remainingTime(color).centis
      )

  sealed trait ClockEvent extends Event

  /** Both clocks after a move. A byo-yomi clock (ADR 0020 §7) adds each side's periods left and the period
    * length in seconds; `white` and `black` are then the main time, or the time left in the current period.
    */
  case class Clock(
      white: Centis,
      black: Centis,
      nextLagComp: Option[Centis] = None,
      byoyomi: Option[Clock.Byoyomi] = None
  ) extends ClockEvent:
    def typ = "clock"
    def data =
      Json
        .obj(
          "white" -> white.toSeconds,
          "black" -> black.toSeconds
        )
        .add("lag" -> nextLagComp.filter(_ > Centis(1)))
        .add("periods" -> byoyomi.map(b => Json.obj("b" -> b.periods.black, "w" -> b.periods.white)))
        .add("byo" -> byoyomi.map(_.periodSeconds))
  object Clock:
    case class Byoyomi(periods: ByColor[Int], periodSeconds: Int)

    def apply(clock: ChessClock): Clock =
      Clock(
        clock.remainingTime(Color.White),
        clock.remainingTime(Color.Black),
        clock.lagCompEstimate(clock.color)
      )

    def apply(clock: GameClock): Clock = clock match
      case GameClock.Fischer(c) => apply(c)
      case GameClock.Byoyomi(c) => apply(c)

    def apply(clock: ligo.gorules.ByoyomiClock): Clock =
      def reading(color: Color) = clock.reading(GoBridge.goColor(color))
      Clock(
        Centis(reading(Color.White).centis),
        Centis(reading(Color.Black).centis),
        clock.lagCompEstimate(clock.toMove).map(Centis(_)),
        Byoyomi(
          ByColor(reading(Color.White).periodsLeft, reading(Color.Black).periodsLeft),
          clock.config.periodSeconds
        ).some
      )

  case class Berserk(color: Color) extends Event:
    def typ = "berserk"
    def data = Json.toJson(color)

  case class CorrespondenceClock(white: Float, black: Float) extends ClockEvent:
    def typ = "cclock"
    def data = Json.obj("white" -> white, "black" -> black)
  object CorrespondenceClock:
    def apply(clock: chess.CorrespondenceClock): CorrespondenceClock =
      CorrespondenceClock(clock.whiteTime, clock.blackTime)

  case class CheckCount(white: Int, black: Int) extends Event:
    def typ = "checkCount"
    def data =
      Json.obj(
        "white" -> white,
        "black" -> black
      )

  case class State(
      turns: Ply,
      status: Option[Status],
      winner: Option[Color],
      whiteOffersDraw: Boolean,
      blackOffersDraw: Boolean
  ) extends Event:
    def typ = "state"
    def data =
      Json
        .obj(
          "color" -> turns.turn,
          "turns" -> turns
        )
        .add("status" -> status)
        .add("winner" -> winner)
        .add("wDraw" -> whiteOffersDraw)
        .add("bDraw" -> blackOffersDraw)

  case class TakebackOffers(
      white: Boolean,
      black: Boolean
  ) extends Event:
    def typ = "takebackOffers"
    def data =
      Json
        .obj()
        .add("white" -> white)
        .add("black" -> black)
    override def owner = true

  case class Crowd(
      white: Boolean,
      black: Boolean,
      watchers: Option[JsValue]
  ) extends Event:
    def typ = "crowd"
    def data =
      Json
        .obj(
          "white" -> white,
          "black" -> black
        )
        .add("watchers" -> watchers)
