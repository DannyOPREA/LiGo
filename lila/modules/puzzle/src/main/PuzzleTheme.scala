package lila.puzzle

import lila.core.i18n.I18nKey
import lila.core.i18n.I18nKey.puzzleTheme as i

case class PuzzleTheme(key: PuzzleTheme.Key, name: I18nKey, description: I18nKey)

// LiGo (ADR 0025 section 1): the chess themes (forks, mates, openings...) are gone; these are the
// Go ones the generator and the classics use (tools/puzzles/schema/puzzle.schema.json lists the
// same twelve). lila's translations have no keys for them, so their names and descriptions are
// plain English, as `I18nKey("...")` does elsewhere in LiGo for strings with no translation yet.
object PuzzleTheme:

  opaque type Key = String
  object Key extends OpaqueString[Key]

  case class WithCount(theme: PuzzleTheme, count: Int)

  enum VoteError:
    case Unchanged
    case Fail(msg: String) extends VoteError
    def message: String = this match
      case Fail(msg) => msg
      case Unchanged => "unchanged"

  private def go(key: String, name: String, description: String) =
    PuzzleTheme(Key(key), I18nKey(name), I18nKey(description))

  val mix = PuzzleTheme(Key("mix"), i.mix, i.mixDescription)

  val lifeAndDeath = go("lifeAndDeath", "Life and death", "A group must live, or be killed.")
  val living = go("living", "Living", "Make your group live: two eyes, or seki.")
  val killing = go("killing", "Killing", "Kill the group before it can make two eyes.")
  val ko = go("ko", "Ko", "The result hangs on a ko fight.")
  val capturingRace =
    go("capturingRace", "Capturing race", "Two groups short of liberties: who captures first?")
  val tesuji = go("tesuji", "Tesuji", "A clever local move that works where the obvious one fails.")
  val eyeShape = go("eyeShape", "Eye shape", "Make, or stop, two eyes: the shape of the eye space decides.")
  val snapback = go("snapback", "Snapback", "Give up a stone, then capture more by taking it back.")
  val throwIn = go("throwIn", "Throw-in", "Play a stone into the eye space to shrink it.")
  val corner = go("corner", "Corner", "The fight is in a corner of the board.")
  val edge = go("edge", "Edge", "The fight is along a side of the board.")
  val centre = go("centre", "Centre", "The fight is in the middle of the board.")

  val categorized = List[(I18nKey, List[PuzzleTheme])](
    I18nKey.puzzle.recommended -> List(
      mix
    ),
    I18nKey("Goals") -> List(
      lifeAndDeath,
      living,
      killing
    ),
    I18nKey("Techniques") -> List(
      eyeShape,
      tesuji,
      snapback,
      throwIn
    ),
    I18nKey("Fights") -> List(
      ko,
      capturingRace
    ),
    I18nKey("Locations") -> List(
      corner,
      edge,
      centre
    )
  )

  val visible: List[PuzzleTheme] = categorized.flatMap(_._2)

  private val byKey: Map[Key, PuzzleTheme] = visible.mapBy(_.key)

  private val byLowerKey: Map[String, PuzzleTheme] = visible.mapBy(_.key.value.toLowerCase)

  // themes that can't be voted by players: the generator derives them from the position
  val staticThemes: Set[Key] = Set(
    lifeAndDeath,
    living,
    killing,
    corner,
    edge,
    centre
  ).map(_.key)

  def apply(key: Key): PuzzleTheme = byKey.getOrElse(key, mix)

  def findAny(key: String) = byLowerKey.get(key.toLowerCase)
  def findVisible(key: String) = findAny(key)

  def findOrMix(key: String) = findVisible(key) | mix

  def findDynamic(key: String) = findVisible(key).filterNot(t => staticThemes(t.key))
