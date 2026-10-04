package lila.rating

import lila.core.perf.{ UserPerfs, UserWithPerfs }
import lila.core.user.{ LightPerf, WithPerf }
import lila.rating.UserPerfsExt.bestRating

object UserWithPerfs:

  extension (p: UserWithPerfs)
    def usernameWithBestRating = s"${p.username} (${p.perfs.bestRating})"
    def titleUsernameWithBestRating =
      p.title.fold(p.usernameWithBestRating): t =>
        s"$t ${p.usernameWithBestRating}"
    // LiGo (unit 5.6): the profile's link preview title, "Name (5k)", or the name alone before a rank
    def titleUsernameWithGoRank =
      val go = p.perfs.go
      val name = p.title.fold(p.username.value)(t => s"$t ${p.username}")
      if GoRating.rankKnown(go) then s"$name (${GoRating.label(go.glicko)})" else name
    def lightPerf(key: PerfKey) =
      val perf = p.perfs(key)
      LightPerf(p.light, key, perf.intRating, perf.progress)
    def only(pk: PerfKey) = WithPerf(p.user, p.perfs(pk))

  def apply(user: User, perfs: Option[UserPerfs]): UserWithPerfs =
    new UserWithPerfs(user, perfs | lila.rating.UserPerfs.default(user.id))
  given UserIdOf[UserWithPerfs] = _.user.id
