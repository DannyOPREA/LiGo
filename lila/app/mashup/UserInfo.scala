package lila.app
package mashup

import alleycats.Zero
import play.api.data.Form

import lila.bookmark.BookmarkApi
import lila.core.data.SafeJsonStr
import lila.core.perf.UserWithPerfs
import lila.core.user.User
import lila.game.Crosstable
import lila.relation.RelationApi
import lila.mon.extensions.*

case class UserInfo(
    nbs: UserInfo.NbGames,
    user: UserWithPerfs,
    trophies: lila.api.UserApi.TrophiesAndAwards,
    ratingChart: Option[SafeJsonStr]
):
  export trophies.ranks
  export nbs.crosstable

object UserInfo:

  enum Angle(val key: String):
    case Activity extends Angle("activity")
    case Games extends Angle("games")
    case Other extends Angle("other")

  case class Social(
      relation: Option[lila.relation.Relation],
      notes: List[lila.user.Note],
      followable: Boolean,
      blocked: Boolean
  )

  final class SocialApi(
      relationApi: RelationApi,
      noteApi: lila.user.NoteApi,
      prefApi: lila.pref.PrefApi
  )(using Executor):
    def apply(u: User)(using ctx: Context): Fu[Social] =
      (
        ctx.userId.so(relationApi.fetchRelation(_, u.id).mon(lila.mon.user.segment("relation"))),
        ctx.useMe(noteApi.getForMyPermissions(u).mon(lila.mon.user.segment("notes"))),
        ctx.isAuth.so(prefApi.followable(u.id).mon(lila.mon.user.segment("followable"))),
        ctx.userId.so(relationApi.fetchBlocks(u.id, _).mon(lila.mon.user.segment("blocks")))
      ).mapN(Social.apply)

  case class NbGames(
      crosstable: Option[Crosstable.WithMatchup],
      playing: Int,
      imported: Int,
      bookmark: Int
  ):
    def withMe: Option[Int] = crosstable.map(_.crosstable.nbGames)

  object NbGames:
    given Zero[NbGames] = Zero(NbGames(none, 0, 0, 0))

  final class NbGamesApi(
      bookmarkApi: BookmarkApi,
      gameCached: lila.game.Cached,
      crosstableApi: lila.game.CrosstableApi
  )(using Executor):
    def apply(u: User, withCrosstable: Boolean)(using me: Option[Me]): Fu[NbGames] =
      (
        withCrosstable.so:
          me
            .filter(u.isnt(_))
            .traverse: me =>
              crosstableApi.withMatchup(me.userId, u.id).mon(lila.mon.user.segment("crosstable"))
        ,
        gameCached.nbPlaying(u.id).mon(lila.mon.user.segment("nbPlaying")),
        gameCached.nbImportedBy(u.id).mon(lila.mon.user.segment("nbImported")),
        bookmarkApi.countByUser(u).mon(lila.mon.user.segment("nbBookmarks"))
      ).mapN(NbGames.apply)

  final class UserInfoApi(
      perfsRepo: lila.user.UserPerfsRepo,
      ratingChartApi: lila.history.RatingChartApi,
      userApi: lila.api.UserApi
  )(using Executor):
    def fetch(user: User, nbs: NbGames, restricted: Boolean)(using
        ctx: Context
    ): Fu[UserInfo] =
      val full = !restricted
      def showRatings = full && ctx.noBlind && ctx.pref.showRatings
      (
        perfsRepo.withPerfs(user),
        userApi.getTrophiesAndAwards(user).mon(lila.mon.user.segment("trophies")),
        showRatings
          .so(ratingChartApi(user, computeIfNeeded = ctx.isAuth))
          .mon(lila.mon.user.segment("ratingChart"))
      ).mapN(UserInfo(nbs, _, _, _))
