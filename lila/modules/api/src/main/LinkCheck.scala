package lila.api

import scala.annotation.nowarn

import lila.chat.UserLine
import lila.core.config.NetDomain
import lila.core.chat.PublicSource
import lila.team.{ Team, TeamApi }

/* Determine if a link to a lichess resource
 * can be posted from another lichess resource.
 * Owners of a resource can post any link on it (but not to it).
 * Links to a team resource can be posted from another resource of the same team.
 * Links to official resources can be posted from anywhere.
 * */
final private class LinkCheck(
    domain: NetDomain,
    teamApi: TeamApi
)(using Executor):

  import LinkCheck.*

  def apply(line: UserLine, source: PublicSource): Fu[Boolean] =
    if multipleLinks.find(line.text) then fuFalse
    else
      // study link check removed with the study module (unit 3.3).
      line.text match
        case teamLinkR(id) => withSource(source, teamLink)(id, line)
        case _ => fuTrue

  private def withSource(
      source: PublicSource,
      f: (String, FullSource) => Fu[Boolean]
  )(id: String, line: UserLine): Fu[Boolean] = {
    source match
      case PublicSource.Team(id) => teamApi.idAndLeaderIds(id).map2(FullSource.TeamSource.apply)
      case _ => fuccess(none)
  }.flatMapz { source =>
    // the owners of a chat can post whichever link they like
    if source.owners(line.userId) then fuTrue
    else f(id, source)
  }

  private def teamLink(@nowarn teamId: String, @nowarn source: FullSource) = fuFalse

  private val multipleLinks = s"(?i)$domain.+$domain".r.unanchored
  private val teamLinkR = s"(?i)$domain/team/([\\w-]+)".r.unanchored

private object LinkCheck:

  enum FullSource(val owners: Set[UserId], val teamId: Option[TeamId]):
    case TeamSource(value: Team.IdAndLeaderIds) extends FullSource(value.leaderIds, value.id.some)
