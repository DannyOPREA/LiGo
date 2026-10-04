package controllers

import play.api.mvc.*

import lila.app.*
import lila.cms.CmsPage
import lila.core.id.{ CmsPageId, CmsPageKey }
import lila.common.HTTPRequest

final class Cms(env: Env) extends LilaController(env):

  def api = env.cms.api

  // crud

  def index = Secure(_.Pages): ctx ?=>
    for
      pages <- api.list
      renderedPage <- renderPage(views.cms.index(pages))
    yield Ok(renderedPage)

  def createForm(key: Option[CmsPageKey]) = Secure(_.Pages) { _ ?=> _ ?=>
    Ok.async(views.cms.create(env.cms.form.create, key))
  }

  def create = SecureBody(_.Pages) { _ ?=> me ?=>
    bindForm(env.cms.form.create)(
      err => BadRequest.async(views.cms.create(err, none)),
      data =>
        val page = data.create(me)
        api.create(page).inject(Redirect(routes.Cms.edit(page.id)).flashSuccess)
    )
  }

  def edit(id: CmsPageId) = Secure(_.Pages) { _ ?=> _ ?=>
    Found(api.withAlternatives(id)): pages =>
      Ok.async(views.cms.edit(env.cms.form.edit(pages.head), pages.head, pages.tail))
  }

  def update(id: CmsPageId) = SecureBody(_.Pages) { _ ?=> me ?=>
    Found(api.withAlternatives(id)): pages =>
      bindForm(env.cms.form.edit(pages.head))(
        err => BadRequest.async(views.cms.edit(err, pages.head, pages.tail)),
        data =>
          api
            .update(pages.head, data)
            .map: page =>
              Redirect(routes.Cms.edit(page.id)).flashSuccess
      )
  }

  def delete(id: CmsPageId) = Secure(_.Pages) { _ ?=> _ ?=>
    Found(api.get(id)): up =>
      api.delete(up.id).inject(Redirect(routes.Cms.index).flashSuccess)
  }

  // pages

  val help = menuPage(CmsPageKey("help"))
  val tos = menuPage(CmsPageKey("tos"))

  def lonePage(key: CmsPageKey) = Open:
    orCreateOrNotFound(key): page =>
      page.canonicalPath.filter(_ != req.path && req.path == s"/page/$key") match
        case Some(path) => Redirect(path)
        case None =>
          pageHit
          Ok.async(views.cms.lone(page))

  def orCreateOrNotFound(key: CmsPageKey)(f: CmsPage.Render => Fu[Result])(using Context): Fu[Result] =
    negotiateCmsOption(key).getOrElse:
      for
        found <- env.cms.render(key)
        res <- found match
          case Some(page) => f(page)
          case None =>
            import lila.ui.Context.ctxMe // no idea why this is needed here
            if isGrantedOpt(_.Pages)
            then Ok.async(views.cms.create(env.cms.form.create, key.some))
            else notFound
      yield res

  def menuPage(key: CmsPageKey) = Open:
    pageHit
    negotiateCms(key): page =>
      views.site.page.withMenu(key.value, page)

  // LiGo: the AGPL source page also works without a "source" CMS page in the database.
  def source = Open:
    pageHit
    val key = CmsPageKey("source")
    if HTTPRequest.acceptsMarkdown then
      env.cms.api
        .asMarkdown(key)
        .map: text =>
          Ok(text | views.site.ui.sourceDefaultMarkdown).withHeaders(asMarkdown)
    else
      env.cms
        .render(key)
        .flatMap: page =>
          Ok.page:
            views.site.ui.source(
              page.fold(lila.core.i18n.I18nKey.site.sourceCode.txt())(_.title),
              page.fold(views.site.ui.sourceDefault)(views.cms.render),
              env.web.lilaVersion
            )

  private def negotiateCms(
      key: CmsPageKey
  )(f: CmsPage.Render => Fu[lila.ui.Page])(using Context): Fu[Result] =
    negotiateCmsOption(key).getOrElse:
      FoundPage(env.cms.render(key))(f)

  private def negotiateCmsOption(key: CmsPageKey)(using Context): Option[Fu[Result]] =
    HTTPRequest.acceptsMarkdown.option:
      for text <- env.cms.api.asMarkdown(key)
      yield text.fold(notFoundText()): text =>
        Ok(text).withHeaders(asMarkdown)
