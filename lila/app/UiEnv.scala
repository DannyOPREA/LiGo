package lila.app

import lila.ui.*
import lila.web.ui.*
import lila.common.ClientName

object UiEnv
    extends ScalatagsTemplate
    with lila.pref.PrefHelper
    with SecurityHelper
    with Helpers
    with AssetFullHelper:

  export lila.core.lilaism.Lilaism.{ *, given }
  export lila.core.id.ImageId
  export lila.common.extensions.*
  export lila.common.String.html.richText
  export lila.ui.{ Page, Nonce, OpenGraph, PageModule, EsmList, Icon }
  export lila.api.Context.{ ctxToTranslate as _, *, given }

  private var envVar: Option[Env] = None
  def setEnv(e: Env) = envVar = Some(e)
  def env: Env = envVar.get

  def netConfig = env.net
  def picfitUrl = env.memo.picfitUrl
  def imageGetOrigin = env.memo.imageGetOrigin

  given lila.core.config.NetDomain = env.net.domain
  given (using ctx: PageContext): Option[Nonce] = ctx.nonce
  given (using ctx: lila.ui.Context): ClientName = ClientName(ctx.req)

  def apiVersion = lila.security.Mobile.Api.currentVersion

  // helpers dependencies
  def assetBaseUrl = netConfig.assetBaseUrl
  def netBaseUrl = netConfig.baseUrl
  def routeUrl = netConfig.routeUrl
  protected val ratingApi = lila.rating.ratingApi
  protected lazy val flairApi = env.user.flairApi
  def isOnline = env.socket.isOnline
  def lightUserSync = env.user.lightUserSync
  def manifest = env.web.manifest
  val translator = lila.i18n.Translator
  val langList = lila.i18n.LangList
  // Go games have no chess opening (unit 3.17); the helper itself goes in part 2.
  val gameOpening = (_: lila.core.game.Game, _: Boolean) => none
  protected val namer = lila.game.Namer

  protected def isProd = env.mode.isProd

  def helpers: Helpers = this
  def assetHelper: AssetFullHelper = this
  def prefHelper: lila.pref.PrefHelper = this

  def flagApi = lila.user.Flags

  def lightUserFallback = env.user.lightUserSyncFallback
