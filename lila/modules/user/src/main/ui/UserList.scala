package lila.user
package ui

import lila.core.perf.UserWithPerfs
import lila.core.user.LightPerf
import lila.rating.PerfType
import lila.ui.*

import ScalatagsTemplate.{ *, given }
import scalalib.paginator.Paginator

final class UserList(helpers: Helpers, bits: UserBits):
  import helpers.{ *, given }

  def page(
      online: List[UserWithPerfs],
      leaderboards: lila.rating.UserPerfs.Leaderboards,
      nbAllTime: List[LightCount]
  )(using ctx: Context) =
    Page(trans.site.players.txt())
      .css("user.list")
      .flag(_.fullScreen)
      .graph(
        title = "Chess players and leaderboards",
        url = routeUrl(routes.User.list),
        description =
          "Best chess players in bullet, blitz, rapid, classical, Chess960 and more chess variants"
      ):
        main(cls := "page-menu")(
          bits.communityMenu("leaderboard"),
          div(cls := "community page-menu__content box box-pad")(
            st.section(cls := "community__online")(
              h2(trans.site.onlinePlayers()),
              ol(cls := "user-top"):
                online.map: u =>
                  li(
                    userLink(u),
                    ctx.pref.showRatings.option(showBestPerf(u.perfs))
                  )
            ),
            div(cls := "community__leaders")(
              h2(trans.site.leaderboard()),
              div(cls := "leaderboards")(
                userTopPerf(leaderboards.bullet, PerfKey.bullet),
                userTopPerf(leaderboards.blitz, PerfKey.blitz),
                userTopPerf(leaderboards.rapid, PerfKey.rapid),
                userTopPerf(leaderboards.classical, PerfKey.classical),
                userTopPerf(leaderboards.ultraBullet, PerfKey.ultraBullet),
                userTopActive(nbAllTime, trans.site.activePlayers(), icon = Icon.Swords.some),
                userTopPerf(leaderboards.crazyhouse, PerfKey.crazyhouse),
                userTopPerf(leaderboards.chess960, PerfKey.chess960),
                userTopPerf(leaderboards.antichess, PerfKey.antichess),
                userTopPerf(leaderboards.atomic, PerfKey.atomic),
                userTopPerf(leaderboards.threeCheck, PerfKey.threeCheck),
                userTopPerf(leaderboards.kingOfTheHill, PerfKey.kingOfTheHill),
                userTopPerf(leaderboards.horde, PerfKey.horde),
                userTopPerf(leaderboards.racingKings, PerfKey.racingKings)
              )
            )
          )
        )

  private def userTopPerf(users: List[LightPerf], pk: PerfKey)(using ctx: Context) =
    st.section(cls := "user-top")(
      h2(cls := "text", dataIcon := pk.perfIcon)(
        a(href := routes.User.top(pk))(pk.perfTrans)
      ),
      ol(users.map: l =>
        li(
          lightUserLink(l.user),
          ctx.pref.showRatings.option(l.rating)
        ))
    )

  private def userTopActive(users: List[LightCount], hTitle: Frag, icon: Option[Icon])(using Context) =
    st.section(cls := "user-top")(
      h2(cls := "text", dataIcon := icon.map(_.toString))(hTitle),
      ol(users.map: u =>
        li(
          lightUserLink(u.user),
          span(title := trans.site.gamesPlayed.txt())(s"#${u.count.localize}")
        ))
    )

  def top(perf: PerfKey, pager: Paginator[LightPerf])(using ctx: Context) =
    import PerfType.given
    val from = (pager.currentPage - 1) * pager.maxPerPage.value + 1
    val title = s"${perf.trans} top"
    Page(title)
      .css("bits.slist")
      .js(infiniteScrollEsmInit)
      .graph(
        title = s"Leaderboard of ${perf.trans}",
        url = routeUrl(routes.User.top(perf.key)),
        description = s"The top rated players in ${perf.trans}, sorted by rating"
      ):
        main(cls := "page-small box")(
          boxTop(h1(a(href := routes.User.list, dataIcon := Icon.LessThan, cls := "text"), title)),
          table(cls := "slist slist-pad slist-invert slist-leaderboard")(
            tbody(cls := "infinite-scroll")(
              pager.currentPageResults.mapWithIndex: (u, i) =>
                val rank = from + i
                tr(
                  td(
                    leaderboardTrophy(perf, rank),
                    span(cls := "lb__rank-num")(rank)
                  ),
                  td(lightUserLink(u.user)),
                  ctx.pref.showRatings.option(
                    frag(
                      td(u.rating),
                      td(ratingProgress(u.progress))
                    )
                  )
                )
              ,
              pagerNextTable(pager, np => routes.User.top(perf, np).url)
            )
          )
        )

  private def leaderboardTrophy(perf: PerfType, rank: Int)(using Translate) =
    bits
      .trophyMeta(perf, rank)
      .map: (css, titleText, imgPath) =>
        span(cls := s"$css lb__trophy trophy--small", title := titleText):
          img(src := assetUrl(imgPath), alt := s"Trophy for $title")
