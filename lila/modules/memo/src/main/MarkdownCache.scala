package lila.memo

import lila.markdown.{ MarkdownRender, MarkdownToastUi }
import lila.core.config

case class MarkdownOptions(
    autoLink: Boolean = false,
    list: Boolean = false,
    table: Boolean = false,
    header: Boolean = false,
    headerAnchorLink: Boolean = false,
    strikeThrough: Boolean = false,
    blockQuote: Boolean = false,
    code: Boolean = false,
    timestamp: Boolean = false,
    toastUi: Boolean = false,
    sourceMap: Boolean = false,
    removeHtmlEntities: Boolean = false,
    allowedTags: Set[String] = Set.empty
)

final class MarkdownCache(
    cacheApi: CacheApi,
    assetDomain: config.AssetDomain
)(using mode: play.api.Mode):

  private val renderMap = scala.collection.concurrent.TrieMap[MarkdownOptions, MarkdownRender]()

  type RenderKey = MarkdownRender.Key

  private val cache = cacheApi[(RenderKey, Markdown, MarkdownOptions), Html](8_192, "memo.markdown"):
    _.maximumSize(16_384)
      .expireAfterWrite(if mode.isProd then 20.minutes else 1.second)
      .buildAsyncFuture: (key, markdown, opts) =>
        fuccess(bodyProcessor(key, opts)(markdown))

  def toHtml(key: RenderKey, markdown: Markdown, opts: MarkdownOptions) =
    cache.get((key, markdown, opts))

  def toHtmlSync(key: RenderKey, markdown: Markdown, opts: MarkdownOptions): Html =
    cache
      .getIfPresent((key, markdown, opts))
      .flatMap(_.value.collect { case scala.util.Success(html) => html })
      .getOrElse:
        val html = bodyProcessor(key, opts)(markdown)
        cache.put((key, markdown, opts), fuccess(html))
        html

  private def getRenderer(opts: MarkdownOptions): MarkdownRender =
    renderMap.getOrElseUpdate(
      opts,
      MarkdownRender(
        autoLink = opts.autoLink,
        list = opts.list,
        strikeThrough = opts.strikeThrough,
        header = opts.header,
        headerAnchorLink = opts.headerAnchorLink,
        blockQuote = opts.blockQuote,
        code = opts.code,
        timestamp = opts.timestamp,
        table = opts.table,
        sourceMap = opts.sourceMap,
        removeHtmlEntities = opts.removeHtmlEntities,
        allowedTags = opts.allowedTags,
        assetDomain = assetDomain.some
      )
    )

  private def bodyProcessor(key: RenderKey, opts: MarkdownOptions)(text: Markdown): Html =
    lila.mon.Chronometer
      .sync:
        if opts.toastUi then toastUiProcessor(key, opts)(text)
        else getRenderer(opts)(key)(text)
      .mon(lila.mon.markdown.time)
      .logIfSlow(50, logger)(_ => s"slow markdown size: $key ${text.value.size}")
      .result

  private def toastUiProcessor(key: RenderKey, opts: MarkdownOptions): Markdown => Html =
    MarkdownToastUi.unescapeAtUsername.apply
      .andThen(getRenderer(opts)(key))
      .andThen(MarkdownToastUi.unescapeUnderscoreInLinks.apply)
