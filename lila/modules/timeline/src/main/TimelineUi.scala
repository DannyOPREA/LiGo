package lila.timeline
package ui

import lila.core.timeline.*
import lila.ui.*

import ScalatagsTemplate.{ *, given }

final class TimelineUi(helpers: Helpers):
  import helpers.{ *, given }

  def entries(entries: Vector[Entry])(using Context) =
    div(cls := "entries")(
      filterEntries(entries).map: entry =>
        div(cls := "entry")(renderEntry(entry)),
      entries.nonEmpty.option:
        a(cls := "more", href := routes.Timeline.home)(trans.site.more(), " »")
    )

  def more(entries: Vector[Entry])(using Context) =
    Page(trans.site.timeline.txt())
      .css("bits.slist"):
        main(cls := "timeline page-small box")(
          h1(cls := "box__top")(trans.site.timeline()),
          table(cls := "slist slist-pad"):
            tbody:
              filterEntries(entries).map: e =>
                tr(td(renderEntry(e)))
        )

  private def filterEntries(entries: Vector[Entry])(using ctx: Context) =
    if ctx.kid.no then entries
    else entries.filter(_.okForKid)

  private def userLink(userId: UserId)(using ctx: Context) = ctx.me match
    case Some(me) if me.is(userId) => lightUserLink(me.light, withOnline = true)(cls := "online")
    case _ => userIdLink(userId.some, withOnline = true)

  private def renderEntry(e: Entry)(using ctx: Context) =
    frag(
      e.decode.map[Frag]:
        case Follow(u1, u2) => trans.site.xStartedFollowingY(userLink(u1), userLink(u2))
        // TeamJoin/TeamCreate/ForumPost/UblogPost/UblogPostLike are never published any more
        // (unit 3.6 removed teams, the forum and blogs); old stored entries render as plain text.
        case TeamJoin(userId, teamId) =>
          trans.site.xJoinedTeamY(userLink(userId), teamId.value)
        case TeamCreate(userId, teamId) =>
          trans.site.xCreatedTeamY(userLink(userId), teamId.value)
        case ForumPost(userId, _, topicName, _) =>
          trans.site.xPostedInForumY(userLink(userId), shorten(topicName, 30))
        case UblogPost(userId, _, _, title) =>
          trans.ublog.xPublishedY(userLink(userId), shorten(title, 40))
        // TourJoin/SimulCreate/SimulJoin are never published any more (unit 3.2 removed the
        // tournament and simul modules); old stored timeline entries render as plain text.
        case TourJoin(userId, _, tourName) =>
          trans.site.xCompetesInY(userLink(userId), tourName)
        case SimulCreate(userId, _, simulName) =>
          trans.site.xHostsY(userLink(userId), simulName)
        case SimulJoin(userId, _, simulName) =>
          trans.site.xJoinsY(userLink(userId), simulName)
        case GameEnd(playerId, opponent, win, perfKey, noResult) =>
          (win match
              case Some(true) => trans.site.victoryVsYInZ
              case Some(false) => trans.site.defeatVsYInZ
              case None => trans.site.drawVsYInZ // "%1$s vs %2$s in %3$s", for no result too
          )(
            a(
              href := routes.Round.player(playerId),
              dataIcon := perfKey.perfIcon,
              cls := "text glpt"
            )(win match
              case Some(true) => trans.site.victory()
              case Some(false) => trans.site.defeat()
              case None => if noResult.has(true) then trans.site.goNoResult() else trans.site.draw()),
            userIdLink(opponent),
            perfKey.perfTrans
          )
        case StudyLike(userId, _, studyName) =>
          // study route removed with the study module (unit 3.3); old timeline entries still
          // render, without a link.
          trans.site.xLikesY(userLink(userId), studyName)
        case PlanStart(userId) =>
          trans.patron.xBecamePatron(userLink(userId))
        case PlanRenew(userId, months) =>
          trans.patron.xIsPatronForNbMonths
            .plural(months, userLink(userId), months)
        case UblogPostLike(userId, _, postTitle) =>
          trans.site.xLikesY(userLink(userId), postTitle)
      ,
      " ",
      pastMomentWithPreload(e.date)
    )
