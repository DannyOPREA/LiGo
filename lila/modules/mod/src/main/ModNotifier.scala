package lila.mod

import lila.core.i18n.Translator
import lila.core.notify.{ NotifyApi, NotificationContent }
import lila.rating.PerfType

// The "action taken" and kid mode private messages went with the msg module (unit 3.6).
final private class ModNotifier(notifyApi: NotifyApi)(using Translator):

  def refund(user: User, pt: PerfType, points: Int): Funit =
    given play.api.i18n.Lang = user.realLang | lila.core.i18n.defaultLang
    notifyApi.notifyOne(user, NotificationContent.RatingRefund(perf = pt.trans, points))
