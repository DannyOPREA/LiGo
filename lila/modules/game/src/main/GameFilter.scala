package lila.game

enum GameFilter:
  val name = toString
  // `search` went with the gameSearch module (unit 3.7); old /search links fall back to `all`.
  case all, me, rated, win, loss, draw, playing, bookmark, imported

object GameFilter:

  val list: NonEmptyList[GameFilter] =
    NonEmptyList.of(all, me, rated, win, loss, draw, playing, bookmark, imported)

  def apply(name: String) =
    list.find(_.name == name) | list.head

case class GameFilterMenu(
    all: NonEmptyList[GameFilter],
    current: GameFilter
):
  def list = all.toList
