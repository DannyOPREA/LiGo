package lila.api

import lila.chat.UserLine
import lila.core.config.NetDomain
import lila.core.chat.PublicSource

/* Determine if a link to a lichess resource
 * can be posted from another lichess resource.
 * A line may hold at most one link to the site.
 * (The study link check went with the study module, unit 3.3, and the team link check with the
 * team module, unit 3.6.)
 * */
final private class LinkCheck(domain: NetDomain):

  def apply(line: UserLine, @annotation.nowarn source: PublicSource): Fu[Boolean] =
    fuccess(!multipleLinks.find(line.text))

  private val multipleLinks = s"(?i)$domain.+$domain".r.unanchored
