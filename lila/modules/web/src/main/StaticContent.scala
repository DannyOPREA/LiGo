package lila.web

import play.api.libs.json.{ JsObject, Json }
import play.api.mvc.RequestHeader

import lila.common.HTTPRequest
import lila.core.config.NetConfig

object StaticContent:

  val robotsTxt = """User-agent: *
Allow: /
Disallow: /game/export/
Disallow: /games/export/
Disallow: /api/
Disallow: /opening/config/
Disallow: /study/search
Disallow: /study/embed/
Disallow: /embed/
Disallow: /video?*
Disallow: /training/of-player
Allow: /game/export/gif/thumbnail/
"""

  // LiGo: the installable app's manifest (unit 9.6, ADR 0026 §1). No related_applications: LiGo has
  // no store app. ui/playground/e2e/manifest.json is this manifest for asset domain "localhost:8080";
  // StaticContentTest keeps the two equal and the browser test installs from that copy. The name is
  // "LiGo" whatever `net.site.name` says (ADR 0026 §1), so that copy doesn't depend on the config.
  def manifest(net: NetConfig): JsObject = manifest(net.assetDomain.value)

  def manifest(assetDomain: String): JsObject =
    def icon(file: String, size: Int, purpose: String) =
      Json.obj(
        "src" -> s"//$assetDomain/assets/logo/$file",
        "sizes" -> s"${size}x$size",
        "type" -> "image/png",
        "purpose" -> purpose
      )
    Json.obj(
      "id" -> "/",
      "name" -> "LiGo",
      "short_name" -> "LiGo",
      "description" -> "A free, open-source Go server in the style of lichess",
      "start_url" -> "/",
      "display" -> "standalone",
      "background_color" -> "#161512",
      "theme_color" -> "#161512",
      "icons" -> (List(32, 64, 128, 192, 256, 512)
        .map(size => icon(s"ligo-favicon-$size.png", size, "any")) :+
        icon("ligo-maskable-512.png", 512, "maskable"))
    )

  val mobileAndroidId = "org.lichess.mobileV2"
  val mobileAndroidUrl = s"https://play.google.com/store/apps/details?id=$mobileAndroidId"
  val mobileIosUrl = "https://apps.apple.com/app/lichess/id1662361230"
  val mobileFdroidUrl = s"https://f-droid.org/packages/$mobileAndroidId"

  def appStoreUrl(using req: RequestHeader) =
    if HTTPRequest.isAndroid(req) then mobileAndroidUrl else mobileIosUrl

  val swagStoreTlds = Map(
    "US" -> "com",
    "CA" -> "ca",
    "DE" -> "de",
    "FR" -> "fr",
    "UK" -> "co.uk",
    "IT" -> "it",
    "ES" -> "es",
    "NL" -> "nl",
    "PL" -> "pl",
    "BE" -> "be",
    "DK" -> "dk",
    "AU" -> "com.au",
    "IE" -> "ie",
    "NO" -> "no",
    "CH" -> "ch",
    "FI" -> "fi",
    "SE" -> "se",
    "AT" -> "at"
  )
  def swagUrl(countryCode: Option[String]) =
    val tld = swagStoreTlds.getOrElse(~countryCode, "net")
    s"https://lichess.myspreadshop.$tld/"

  def legacyQaQuestion(id: Int) =
    val faq = routes.Main.faq.url
    id match
      case 103 => s"$faq#acpl"
      case 258 => s"$faq#marks"
      case 13 => s"$faq#titles"
      case 87 => routes.User.ratingDistribution(PerfKey.blitz).url
      case 110 => s"$faq#name"
      case 29 => s"$faq#titles"
      case 4811 => s"$faq#lm"
      case 216 => routes.Main.app.url
      case 340 => s"$faq#trophies"
      case 6 => s"$faq#ratings"
      case 207 => s"$faq#hide-ratings"
      case 547 => s"$faq#leaving"
      case 259 => s"$faq#trophies"
      case 342 => s"$faq#provisional"
      case 50 => routes.Cms.help.url
      case 46 => s"$faq#name"
      case 122 => s"$faq#marks"
      case _ => faq
