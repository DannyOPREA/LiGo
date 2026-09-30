package views.coach

import play.api.data.Form

import lila.app.UiEnv.{ *, given }

lazy val ui = lila.coach.ui.CoachUi(helpers)(
  picfitUrl,
  lila.user.Profile.flagInfo,
  flagApi,
  netConfig.email,
  langCodes =>
    ctx ?=> lila.i18n.LangPicker.sortFor(langList.popularNoRegion.filter(l => langCodes(l.code)), ctx.req)
)

lazy val editUi = lila.coach.ui.CoachEditUi(helpers, ui)

def show(c: lila.coach.Coach.WithUser)(using ctx: Context) = ui.show(
  c,
  // study removed in unit 3.3 and ublog in unit 3.6: coaches no longer feature studies or blog
  // posts on their profile.
  studies = Nil,
  posts = Nil
)

def edit(c: lila.coach.Coach.WithUser, form: Form[?])(using ctx: Context) =
  editUi(c, form, views.account.ui.AccountPage(s"${c.user.titleUsername} coach page", "coach"))
