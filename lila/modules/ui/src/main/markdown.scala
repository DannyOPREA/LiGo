package lila.ui

enum MarkdownRealm(val maxImageCount: Int, val imageDesignWidth: Int, val toastUi: Boolean):
  // The blog, forum, team and broadcast realms went with their modules (units 3.3 and 3.6).
  case cms extends MarkdownRealm(100, 900, true)
  def key = toString

object MarkdownRealm:
  val byKey = values.mapBy(_.key)
