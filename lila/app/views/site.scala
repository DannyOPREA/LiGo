package views.site

import lila.app.UiEnv.{ *, given }
import lila.cms.CmsPage

val message = lila.web.ui.SiteMessage(helpers)
val ui = lila.web.ui.SitePages(helpers)

object page:

  private val faqUi = lila.web.ui.FaqUi(helpers, ui)(
    standardRankableDeviation = lila.rating.Glicko.standardRankableDeviation,
    variantRankableDeviation = lila.rating.Glicko.variantRankableDeviation
  )

  def faq(using Context) = faqUi.apply.js(esmInitBit("faq"))

  def withMenu(active: String, p: CmsPage.Render)(using Context) =
    ui.SitePage(
      title = p.title,
      active = active,
      contentCls = "page box box-pad force-ltr"
    ).css("bits.page")
      .headAppend(views.cms.alternateMarkdown(p)):
        views.cms.pageContent(p)

  def contact(using Context) =
    ui.SitePage(
      title = trans.contact.contact.txt(),
      active = "contact",
      contentCls = "page box box-pad"
    ).css("bits.contact")
      .js(esmInitBit("contact"))(lila.web.ui.contact(netConfig.email))

  def webmasters(using Context) =
    ui.webmasters(lila.pref.PieceSet.all.map(_.name))

  def survey =
    Page(title = "User Survey")
      .flag(_.noRobots)
      .js(Esm("bits.survey"))(
        main(cls := "survey-redirect")(
          h1("Redirecting...")
        )
      )

