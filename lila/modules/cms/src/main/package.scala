package lila.cms

export lila.core.lilaism.Lilaism.{ *, given }
export lila.common.extensions.*

val markdownOptions = lila.memo.MarkdownOptions(
  autoLink = true,
  list = true,
  table = true,
  header = true,
  headerAnchorLink = true,
  strikeThrough = true,
  blockQuote = true,
  code = true,
  timestamp = false,
  toastUi = true,
  allowedTags = Set("kbd", "video", "center", "details", "summary")
)
