package lila.web
package ui

import play.api.mvc.RequestHeader

import lila.core.i18n.{ I18nKey as trans, Translate }
import lila.ui.*

import ScalatagsTemplate.*

def mobileRedirect(using req: RequestHeader)(using Translate) =
  val callbackUrl = "org.lichess.mobile://login-callback" + req.rawQueryString.nonEmptyOption.so("?" + _)
  Page(trans.app.returningToApp.txt()).i18n(_.app):
    main(cls := "page-small box box-pad")(
      boxTop(
        h1(cls := "text")(trans.app.returningToApp())
      ),
      p(trans.app.ifAppDoesNotOpenAutomatically(trans.app.openTheApp())),
      a(href := callbackUrl, cls := "button")(trans.app.openTheApp())
    )

def mobile(helpers: Helpers)(renderedCmsPage: Frag)(using Translate) =
  import helpers.*

  val appleStoreButton = raw:
    s"""
  <a class="store"
    href="${StaticContent.mobileIosUrl}">
    ${trans.app.downloadOnAppleAppStore.txt()}
  </a>
  """

  val googlePlayButton = raw:
    s"""
  <a class="store"
    href="${StaticContent.mobileAndroidUrl}">
    ${trans.app.downloadOnGooglePlay.txt()}
  </a>
  """

  val fdroidButton = raw:
    s"""
  <a class="store"
    href="${StaticContent.mobileFdroidUrl}">
    ${trans.app.downloadOnFdroid.txt()}
  </a>
  """

  Page(trans.app.lichessMobileApp.txt())
    .i18n(_.app)
    .js(Esm("bits.qrcode"))
    .css("bits.mobile")
    .hrefLangs(lila.ui.LangPath(routes.Main.app)):
      main(
        div(cls := "mobile page-small box box-pad")(
          h1(cls := "box__top")(trans.app.lichessMobileApp()),
          div(cls := "sides")(
            div(cls := "left-side")(
              div(cls := "stores")(
                googlePlayButton,
                fdroidButton,
                appleStoreButton
              ),
              renderedCmsPage,
              qrcode(routeUrl(routes.Main.redirectToAppStore), 300),
              div(
                trans.app.viewAllReleases(
                  a(href := "https://github.com/lichess-org/mobile/releases")(trans.app.allReleases())
                )
              )
            ),
            // unit 3.1: lichess's app screenshot and store badges were removed (non-free images)
            div(cls := "right-side")
          )
        )
      )
