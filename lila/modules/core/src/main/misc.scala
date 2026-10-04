package lila.core
package misc

import play.api.i18n.Lang

import lila.core.id.{ GameId, PuzzleId }
import lila.core.userId.*

package puzzle:
  case class DailyChange(id: PuzzleId)

package lpv:
  type LinkRender = (String, String) => Option[scalatags.Text.Frag]

package mailer:
  case class CorrespondenceOpponent(
      opponentId: Option[UserId],
      remainingTime: Option[java.time.Duration],
      gameId: GameId
  )
  case class CorrespondenceOpponents(userId: UserId, opponents: List[CorrespondenceOpponent])

package push:
  case class TourSoon(tourId: String, tourName: String, userIds: Iterable[UserId], swiss: Boolean)

package oauth:
  opaque type AccessTokenId = String
  object AccessTokenId extends OpaqueString[AccessTokenId]

  case class TokenRevoke(id: AccessTokenId)

type BookmarkExists = (game.Game, Option[userId.UserId]) => Fu[Boolean]

case class AuthCustomUi(name: String, imagePath: String, cssClass: String, lang: Lang)

enum AppealTopic:
  case cheat, boost, close, comm, rank, arena, prize, report, play, chat, blog, streamer, warning, legacy
  def key = toString
object AppealTopic:
  def byKey = values.mapBy(_.toString)

type AppealPresetTag = AppealTopic | "any" | "none"
