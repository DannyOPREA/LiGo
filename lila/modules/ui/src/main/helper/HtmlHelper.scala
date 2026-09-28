package lila.ui

import scalatags.text.Builder

import lila.core.config.NetDomain
import lila.ui.ScalatagsTemplate.{ *, given }

object HtmlHelper:

  // LiGo's two-stone logo drawn stroke by stroke (lichess's spinner traced its non-free logo)
  val spinner: Frag = raw:
    """<div class="spinner"><svg viewBox="-2 -2 54 54"><g fill="none"><path id="a" stroke-width="3.5" d="M31 4a15 15 0 1 1 0 30a15 15 0 1 1 0-30"/><path id="b" stroke-width="3.5" d="M19 14a17 17 0 0 1 0 34"/><path id="c" stroke-width="3.5" d="M19 48a17 17 0 0 1 0-34"/></g></svg></div>"""

  def qrcode(url: Url, width: Int = 320): Tag =
    canvas(cls := "qrcode", attr("data-qr-url") := url, attr("data-width") := width)

  def titleOrText(v: String)(using ctx: Context): Modifier = titleOrTextFor(ctx.blind, v)

  def titleOrTextFor(blind: Boolean, v: String): Modifier = (t: Builder) =>
    if blind then t.addChild(StringFrag(v))
    else t.setAttr("title", Builder.GenericAttrValueSource(v))

  def copyMeLink(url: Url, name: Frag): Tag = copyMe(a(targetBlank, href := url)(name))

  def copyMeContent(url: Url, name: Frag): Tag = copyMeLink(url, name)(cls := "fetch-content")

  def copyMeInput(content: String): Tag =
    copyMe(input(spellcheck := "false", readonly, value := content))

  private def copyMe(target: Tag): Tag =
    div(cls := "copy-me")(
      target(cls := "copy-me__target"),
      button(cls := "copy-me__button button button-metal", dataIcon := Icon.Clipboard)
    )

trait HtmlHelper:

  def richText(rawText: String, nl2br: Boolean = true, expandImg: Boolean = true)(using NetDomain): Frag

  protected def isProd: Boolean

  def testId(id: String): Modifier = if isProd then emptyFrag else attr("data-testid") := id

  export HtmlHelper.*
  export scalalib.StringOps.{ shorten, urlencode, addQueryParam, addQueryParams }
