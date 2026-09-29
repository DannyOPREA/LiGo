package lila.timeline
import lila.core.perm.Permission
import lila.core.timeline.*

private final class TimelineApi(
    relationApi: lila.core.relation.RelationApi,
    userApi: lila.core.user.UserApi,
    entryApi: EntryApi,
    unsubApi: UnsubApi
)(using Executor):

  private val dedup = scalalib.cache.OnceEvery.hashCode[Atom](10.minutes)

  def propagate(p: Propagate): Unit =
    import p.*
    if dedup(data) then
      doPropagate(propagations)
        .flatMap: users =>
          unsubApi.filterUnsub(data.channel, users)
        .foreach: users =>
          if users.nonEmpty then
            for _ <- insertEntry(users, data)
            yield
              lila.common.Bus.pub(ReloadTimelines(users))
              lila.mon.timeline.notification.increment(users.size)

  private def doPropagate(propagations: List[Propagation]): Fu[List[UserId]] =
    Future
      .traverse(propagations):
        case Propagation.Users(ids) => fuccess(ids)
        case Propagation.Followers(id) => relationApi.freshFollowersFromSecondary(id)
        case Propagation.Friends(id) => relationApi.fetchFriends(id)
        case Propagation.ExceptUser(_) => fuccess(Nil)
        case Propagation.ModsOnly(_) => fuccess(Nil)
      .flatMap: users =>
        propagations.foldLeft(fuccess(users.flatten.distinct)):
          case (fus, Propagation.ExceptUser(id)) => fus.dmap(_.filter(id !=))
          case (fus, Propagation.ModsOnly(true)) =>
            fus.flatMap: us =>
              userApi.userIdsWithRoles(modPermissions.map(_.dbKey)).dmap { userIds =>
                us.filter(userIds.contains)
              }
          case (fus, _) => fus

  private def modPermissions =
    List(
      Permission.ModNote,
      Permission.Admin,
      Permission.SuperAdmin
    )

  private def insertEntry(users: List[UserId], data: Atom): Funit =
    entryApi.insert(Entry.ForUsers(Entry.make(data), users))
