package lila.core
package mod

import lila.core.chat.TimeoutReason
import lila.core.id.GameFullId
import lila.core.userId.*

// LogApi (the forum's moderation log calls) went with the forum module (unit 3.6).

trait ModApi:
  def autoEngine(suspectId: report.SuspectId, note: String)(using MyId): Funit

case class MarkCheater(userId: UserId, value: Boolean)
case class MarkBooster(userId: UserId, value: Boolean)
case class ChatTimeout(mod: UserId, user: UserId, reason: TimeoutReason, text: String)
case class Shadowban(userId: UserId, value: Boolean)
case class RankBan(userId: UserId, value: Boolean)
case class ArenaBan(userId: UserId, value: Boolean)
case class PrizeBan(userId: UserId, value: Boolean)
case class ReportBan(userId: UserId, value: Boolean)
case class AutoWarning(userId: UserId, subject: String)
case class Impersonate(modId: ModId, userId: UserId, v: Boolean)
case class SelfReportMark(userId: UserId, name: String, gameId: GameFullId)
case class BoardApiMark(userId: UserId, name: String)
case class LoginWithWeakPassword(userId: UserId)
case class LoginWithBlankedPassword(userId: UserId)
