package lila.core
package irc

import play.api.mvc.Call

import lila.core.id.{ RelayRoundId, RelayTourId, StudyChapterId }
import lila.core.userId.{ UserId, MyId, ModId, UserName }
import lila.core.study.data.StudyChapterName
import lila.core.data.DiffStr

enum ModDomain:
  case Admin, Cheat, Boost, Comm, Other

trait IrcApi:
  def commReportBurst(user: LightUser): Funit
  def broadcastStart(id: RelayRoundId, fullName: String): Funit
  def broadcastError(id: RelayRoundId, name: String, error: String): Funit
  def broadcastMissingFideId(id: RelayRoundId, name: String, players: List[(StudyChapterId, String)]): Funit
  def broadcastAmbiguousPlayers(id: RelayRoundId, name: String, players: List[(String, List[String])]): Funit
  def broadcastOrphanBoard(
      id: RelayRoundId,
      name: String,
      chapter: StudyChapterId,
      boardName: StudyChapterName,
      tier: String
  ): Funit
  def monitorMod(icon: String, text: String, tpe: ModDomain)(using MyId): Funit
  def permissionsLog(user: LightUser, details: String)(using mod: LightUser.Me): Funit
  def broadcasterDm(topicUserId: UserId, senderId: UserId, content: String): Funit
  def broadcastTourUpdate(
      tourName: String,
      tourSlug: String,
      tourId: RelayTourId,
      diff: DiffStr,
      impersonatedBy: Option[ModId] = None
  )(using MyId): Funit
  def bbb(
      by: MyId,
      tpe: "arena" | "event",
      name: String,
      url: Call,
      diff: DiffStr
  ): Funit
