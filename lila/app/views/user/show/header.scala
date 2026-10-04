package views.user
package show

import lila.app.UiEnv.{ *, given }
import lila.app.mashup.UserInfo
import lila.user.Plan.sinceDate
import lila.user.PlayTime.*
import lila.user.Profile.*
import lila.web.ui.bits.splitNumber

object header:

  private val actionMenu = lila.user.ui.UserActionMenu(helpers)

  private val dataTab = attr("data-tab")

  private def possibleSeoBot(u: User) =
    !u.isVerified && !u.hasTitle && u.count.game < 5 && u.profile.exists(_.hasLinks)

  private def userActionsMenu(u: User, social: UserInfo.Social)(using ctx: Context) =
    actionMenu(
      u,
      ctx
        .isnt(u)
        .so:
          views.relation.actions(
            u.light,
            relation = social.relation,
            followable = social.followable,
            blocked = social.blocked
          )
      ,
      ctx.useMe(lila.mod.canImpersonate(u.id))
    )

  private def userDom(u: User)(using ctx: Context) =
    span(
      cls := userClass(u.id, none, withOnline = !u.isPatron, withPowerTip = false),
      dataHref := userUrl(u.username)
    )(
      u.isPatron.not.so(lineIcon(u)),
      titleTag(u.title),
      u.username,
      if ctx.blind
      then s" : ${if isOnline.exec(u.id) then trans.site.online.txt() else trans.site.offline.txt()}"
      else
        userFlair(u).map: flair =>
          if ctx.isAuth then a(href := routes.Account.profile, title := trans.site.setFlair.txt())(flair)
          else flair
    )

  // LiGo: the Go rank beside the name (unit 5.6), the rating in its title; none before a rank is known
  private def rankTag(info: UserInfo)(using ctx: Context) =
    val go = info.user.perfs.go
    (ctx.pref.showRatings && !go.glicko.clueless).option:
      span(cls := "user-show__rank")(goRank(go.intRating, go.provisional))

  def apply(u: User, info: UserInfo, angle: UserInfo.Angle, social: UserInfo.Social)(using ctx: Context) =
    val showLinks = !possibleSeoBot(u) || isGranted(_.Shadowban)
    frag(
      div(cls := "box__top user-show__header")(
        u.patronAndColor.match
          case Some(p) =>
            h1(cls := s"user-link ${if isOnline.exec(u.id) then "online" else "offline"}")(
              patronIcon(p),
              userDom(u),
              rankTag(info)
            )
          case None => h1(userDom(u), rankTag(info)),
        div(cls := "trophies")(
          views.user.bits.perfTrophies(u, info.ranks),
          otherTrophies(info),
          // existing patrons keep their wings; the Patron page went with the plan module (unit 3.7).
          u.plan.active.option(
            span(
              cls := "trophy award patron icon3d",
              ariaTitle(trans.patron.patronSince.txt(showDate(u.plan.sinceDate)))
            )(patronIconChar)
          )
        ),
        u.enabled.no.option(span(cls := "closed")("CLOSED"))
      ),
      div(cls := "user-show__social")(
        div(cls := "number-menu")(
          // broadcast/study counts removed with the relay and study modules (unit 3.3), forum and
          // blog post counts with the forum and ublog modules (unit 3.6).
          (ctx.isAuth && ctx.isnt(u))
            .option(a(cls := "nm-item note-zone-toggle")(splitNumber(s"${social.notes.size} Notes")))
        ),
        div(
          cls := "user-actions dropdown-overflow",
          attr("data-menu") := userActionsMenu(u, social).serialize
        )
      ),
      ctx.isnt(u).option(noteUi.zone(u, social.notes)),
      isGranted(_.UserModView).option(div(cls := "mod-zone mod-zone-full none")),
      standardFlash,
      locally:
        val profile = u.profileOrDefault
        val muted = u.marks.troll && ctx.isnt(u)
        val showProfile =
          ctx.kid.no && u.kid.no && !muted && (showLinks || !profile.hasLinks) || isGranted(_.AccountInfo)
        div(id := "us_profile")(
          if info.ratingChart.isDefined && (!u.lame || ctx.is(u) || isGranted(_.AccountInfo)) then
            views.user.perfStat.ratingHistoryContainer
          else (ctx.is(u) && u.count.game < 10).option(ui.newPlayer(u)),
          div(cls := "profile-side")(
            div(cls := "user-infos")(
              (u.lame && ctx.isnt(u)).option:
                div(cls := "warning tos_warning")(
                  span(dataIcon := Icon.CautionCircle, cls := "is4"),
                  trans.site.thisAccountViolatedTos()
                )
              ,
              showProfile
                .so(profile.nonEmptyRealName)
                .map(strong(cls := List("name" -> true, "muted" -> muted))(_)),
              // FIDE player link removed with the fide module (unit 3.3).
              (showLinks && showProfile || isGranted(_.AccountInfo))
                .so(profile.nonEmptyBio)
                .map: bio =>
                  p(cls := List("bio" -> true, "muted" -> muted))(richText(bio, nl2br = true)),
              div(cls := "stats")(
                profile.officialRating.map: r =>
                  div(r.name.toUpperCase, " rating: ", strong(r.rating)),
                div(cls := "location")(
                  profile.nonEmptyLocation
                    .ifTrue(showProfile)
                    .map: l =>
                      span(cls := List("muted" -> muted))(l),
                  profile.flagInfo.map: c =>
                    frag(
                      img(cls := "flag", src := assetUrl(s"flags/${c.code}.webp")),
                      c.name
                    )
                ),
                p(cls := "thin")(trans.site.memberSince(), " ", showDate(u.createdAt)),
                u.seenAt.map: seen =>
                  p(cls := "thin")(trans.site.lastSeenActive(momentFromNow(seen))),
                ctx
                  .is(u)
                  .option(
                    a(href := routes.Account.profile, title := trans.site.editProfile.txt())(
                      trans.site.profileCompletion(s"${profile.completionPercent}%")
                    )
                  ),
                u.playTime.map: playTime =>
                  frag(
                    p(
                      title := translator.duration(playTime.totalDuration, None, true)
                    )(
                      trans.site.tpTimeSpentPlaying(
                        translator.duration(playTime.totalDuration)
                      )
                    ),
                    playTime.nonEmptyTvDuration.map: tvDuration =>
                      p(
                        title := translator.duration(tvDuration, None, true)
                      )(trans.site.tpTimeSpentOnTV(translator.duration(tvDuration)))
                  ),
                (!muted && u.kid.no).option(
                  div(cls := "social_links col2")(
                    showLinks
                      .option(profile.actualLinks)
                      .filter(_.nonEmpty)
                      .map: links =>
                        frag(
                          strong(trans.site.socialMediaLinks()),
                          links.map: link =>
                            a(href := link.url, targetBlank, noFollow, relMe)(link.site.name)
                        )
                  )
                )
                // the list of the player's teams went with the team module (unit 3.6).
              )
            )
            // The "Chess Insights" link went with the insight module (unit 3.5).
          )
        )
      ,
      (!UserId.isOfficial(u.id)).option:
        div(cls := "angles number-menu number-menu--tabs menu-box-pop")(
          a(
            dataTab := "activity",
            cls := List(
              "nm-item to-activity" -> true,
              "active" -> (angle == UserInfo.Angle.Activity)
            ),
            href := routes.User.show(u.username)
          )(trans.activity.activity()),
          a(
            dataTab := "games",
            cls := List(
              "nm-item to-games" -> true,
              "active" -> (angle.key == "games")
            ),
            href := routes.User.gamesAll(u.username)
          )(
            trans.site.nbGames.plural(info.user.count.game, info.user.count.game.localize),
            (info.nbs.playing > 0).option(
              span(
                cls := "unread",
                title := trans.site.nbPlaying.pluralTxt(info.nbs.playing, info.nbs.playing.localize)
              )(info.nbs.playing)
            )
          )
        )
    )
