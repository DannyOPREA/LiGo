package lila.ws
package ipc

import chess.{ Centis, Color }
import play.api.libs.json.*

import scala.util.{ Success, Try }

sealed trait ClientOut extends ClientMsg

sealed trait ClientOutSite extends ClientOut
sealed trait ClientOutLobby extends ClientOut
sealed trait ClientOutRound extends ClientOut

object ClientOut:

  case class Ping(lag: Option[Int]) extends ClientOutSite

  case class Watch(ids: Set[Game.Id]) extends ClientOutSite

  case object MoveLat extends ClientOutSite

  case object Notified extends ClientOutSite

  case class FollowingOnline(subscribe: Boolean) extends ClientOutSite

  case class SiteForward(payload: JsObject) extends ClientOutSite

  case class Unexpected(msg: JsValue) extends ClientOutSite

  case object Ignore extends ClientOutSite

  // lobby

  case class Idle(value: Boolean, payload: JsValue) extends ClientOutLobby
  case class LobbyJoin(payload: JsValue) extends ClientOutLobby
  case class LobbyForward(payload: JsValue) extends ClientOutLobby

  // study (StudyForward) removed with the study module (unit 3.3).

  // round

  case class RoundPlayerForward(payload: JsValue) extends ClientOutRound
  case class RoundMove(move: GoMove, blur: Boolean, lag: ClientMoveMetrics, ackId: Option[Int])
      extends ClientOutRound
  case class RoundHold(mean: Int, sd: Int) extends ClientOutRound
  case class RoundBerserk(ackId: Option[Int]) extends ClientOutRound
  case class RoundSelfReport(name: String) extends ClientOutRound
  case class RoundFlag(color: Color) extends ClientOutRound
  case object RoundBye extends ClientOutRound
  case class RoundPongFrame(lagMillis: Int) extends ClientOutRound

  // chat

  case class ChatSay(msg: String) extends ClientOut
  case class ChatTimeout(suspect: User.Id, reason: String, text: String) extends ClientOut

  // challenge

  case object ChallengePing extends ClientOut

  // impl

  def parse(str: String): Try[ClientOut] =
    if str == "p" || str == "null" || str == """{"t":"p"}""" then emptyPing
    else
      Try(Json.parse(str)).map:
        case o: JsObject =>
          o.str("t")
            .flatMap:
              case "p" => Some(Ping(o.int("l")))
              case "startWatching" =>
                o.str("d")
                  .map { d =>
                    Watch(Game.Id.from(d.split(" ", 17).take(16).toSet))
                  }
                  .orElse(Some(Ignore)) // old apps send empty watch lists
              case "moveLat" => Some(MoveLat)
              case "notified" => Some(Notified)
              case "following_onlines" => Some(FollowingOnline(o.boolean("d").getOrElse(true)))
              // lobby
              case "idle" => o.boolean("d").map { Idle(_, o) }
              case "join" => Some(LobbyJoin(o))
              case "cancel" | "joinSeek" | "cancelSeek" | "poolIn" | "poolOut" | "hookIn" | "hookOut" =>
                Some(LobbyForward(o))
              // study forwarding ("anaMove", "setPath", "addChapter", etc.) removed with the
              // study module (unit 3.3).
              // round
              case "move" =>
                for
                  d <- o.obj("d")
                  // a Go point ("dd") or "pass" (ADR 0019 §6); chess moves and drops are no longer read
                  move <- d.str("u").flatMap(GoMove.read)
                  blur = d.int("b") contains 1
                  ackId = d.int("a")
                yield RoundMove(move, blur, parseMetrics(d), ackId)
              case "hold" =>
                for
                  d <- o.obj("d")
                  mean <- d.int("mean")
                  sd <- d.int("sd")
                yield RoundHold(mean, sd)
              case "berserk" => Some(RoundBerserk(o.obj("d").flatMap(_.int("a"))))
              case "rep" => o.obj("d").flatMap(_.str("n")).map(RoundSelfReport.apply)
              case "flag" => o.str("d").flatMap(Color.fromName).map(RoundFlag.apply)
              case "bye2" => Some(RoundBye)
              case "blindfold-yes" | "blindfold-no" | "moretime" | "rematch-yes" | "rematch-no" |
                  "takeback-yes" | "takeback-no" | "draw-yes" | "draw-no" | "draw-claim" | "resign" |
                  "resign-force" | "draw-force" | "abort" | "outoftime" |
                  // a Go game's scoring phase (ADR 0020 §6): lila reads `d` itself
                  "score-toggle" | "score-accept" | "score-resume" =>
                Some(RoundPlayerForward(o))
              // chat
              case "talk" => o.str("d").map { ChatSay.apply }
              case "timeout" =>
                for
                  data <- o.obj("d")
                  userId <- data.get[User.Id]("userId")
                  reason <- data.str("reason")
                  text <- data.str("text")
                yield ChatTimeout(userId, reason, text)
              case "ping" => Some(ChallengePing)
              case "opening" | "anaDests" => Some(Ignore)
              case "wrongHole" => Some(Ignore)
              case _ => None
            .getOrElse(Unexpected(o))
        case js => Unexpected(js)

  private val emptyPing: Try[ClientOut] = Success(Ping(None))

  private def parseMetrics(d: JsObject) =
    ClientMoveMetrics(
      d.int("l").map { Centis.ofMillis(_) },
      d.str("s").flatMap { v =>
        Try(Centis(Integer.parseInt(v, 36))).toOption
      }
    )
