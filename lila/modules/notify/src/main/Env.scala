package lila.notify

import com.softwaremill.macwire.*
import lila.common.Bus
import lila.db.dsl.Coll
import lila.core.config.CollName
import lila.core.notify.{ NotificationContent, GetNotifyAllows }

@Module
final class Env(
    db: lila.db.Db,
    userRepo: lila.core.user.UserRepo,
    userApi: lila.core.user.UserApi,
    getLightUserSync: lila.core.LightUser.GetterSync,
    cacheApi: lila.memo.CacheApi
)(using Executor, org.apache.pekko.stream.Materializer):

  lazy val jsonHandlers = wire[JSONHandlers]

  val colls = NotifyColls(notif = db(CollName("notify")), pref = db(CollName("notify_pref")))

  private val maxPerPage = MaxPerPage(7)

  private lazy val repo = wire[NotificationRepo]

  lazy val api = wire[NotifyApi]

  val getAllows = GetNotifyAllows(api.prefs.allows)

  Bus.sub[lila.core.notify.NotifiedBatch]: batch =>
    api.markAllRead(batch.userIds)

  Bus.sub[lila.core.game.CorresAlarmEvent]:
    case lila.core.game.CorresAlarmEvent(userId, pov, opponent) =>
      api.notifyOne(userId, NotificationContent.CorresAlarm(pov.game.id, opponent))

  wire[NotifyCli]

final class NotifyColls(val notif: Coll, val pref: Coll)
