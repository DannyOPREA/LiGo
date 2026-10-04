package views

import lila.app.UiEnv.{ *, given }
export lila.web.ui.bits

val chat = lila.chat.ChatUi

val setup = lila.setup.ui.SetupUi(helpers)

// gathering (shared UI for the tournament/swiss/simul "no prizes" notice) was removed with the
// tournament, swiss and simul modules (unit 3.2).

val relation = lila.relation.ui.RelationUi(helpers)

val auth = lila.web.ui.AuthUi(helpers, lila.rating.GoRating.Rank.all.map(_.name))

object oAuth:
  val token = lila.oauth.ui.TokenUi(helpers)(account.ui.AccountPage, env.mode)
  val authorize = lila.oauth.ui.AuthorizeUi(helpers)(lightUserFallback, auth.customLogo)

// plan (Patron and donation pages) and feed (the news feed) were removed with their modules (unit 3.7).

val cms = lila.cms.ui.CmsUi(helpers)(views.mod.ui.menu("cms"))

// event and userTournament (the event manager and per-user tournament stats pages) were removed
// with the event and tournament modules (unit 3.2).

object account:
  val ui = lila.pref.ui.AccountUi(helpers)
  val pages = lila.pref.ui.AccountPages(helpers, ui, flagApi, lila.rating.GoRating.Rank.all.map(_.name))
  val pref = lila.pref.ui.AccountPref(helpers, prefHelper, ui)
  val twoFactor = lila.pref.ui.TwoFactorUi(helpers, ui)(netConfig.domain)
  val security = lila.security.ui.AccountSecurity(helpers)(ui.AccountPage)

// learn, coordinate, opening, storm and racer (the chess training and opening pages) were removed
// with their modules (unit 3.4).

// practice, study, relay and fide (the study/broadcast/FIDE-player UI) were removed with the
// study, relay, practice, studySearch, fide and title modules (unit 3.3).

// forum (the forum pages) was removed with the forum module (unit 3.6).

val timeline = lila.timeline.ui.TimelineUi(helpers)

// video and gameSearch (the video library and advanced game search) were removed with their
// modules (unit 3.7).

val challenge = lila.challenge.ui.ChallengeUi(helpers)

val dev = lila.web.ui.DevUi(helpers)(views.mod.ui.menu)

def mobile(p: lila.cms.CmsPage.Render)(using Context) =
  lila.web.ui.mobile(helpers)(cms.render(p))

// recap (the yearly recap) was removed with its module (unit 3.7).
