package lila.setup

import chess.format.Fen
import chess.{ Clock, Rated, variant as V }
import play.api.data.Forms.*
import play.api.data.format.Formats.doubleFormat
import scalalib.model.Days

import lila.common.Form.{ *, given }
import lila.core.game.GoSetups
import lila.core.rating.RatingRange
import lila.lobby.TriColor

private object Mappings:

  val variant = typeIn(Config.variants.toSet)
  val boardApiVariants = Set(V.Standard.key)
  val boardApiVariantKeys = typeIn(boardApiVariants)
  val time = of[Double].verifying(HookConfig.validateTime(_))
  val increment = of[Clock.IncrementSeconds].verifying(HookConfig.validateIncrement(_))
  val daysChoices = Days.from(List(1, 2, 3, 5, 7, 10, 14))
  val days = typeIn(daysChoices.toSet)
  def timeMode = number.verifying(TimeMode.ids contains _)
  def mode(withRated: Boolean) = optional(rawMode(withRated))
  def rawMode(withRated: Boolean) =
    number
      .verifying(Rated.byId.contains)
      .verifying(_ == Rated.No.id || withRated)
  val ratingRange = text.verifying(RatingRange.isValid)
  val color = text.verifying(TriColor.names contains _)
  val speed = number.verifying(Config.speeds contains _)
  // Board size, ruleset and komi (unit 3.15); a bad komi for the board is checked by `GoOptions.valid`
  val goSize = optional(number.verifying("Board size must be 9, 13 or 19", GoSetups.sizes.contains))
  val goRuleset = optional(text.verifying("Ruleset must be japanese or chinese", GoSetups.rulesets.contains))
  val goKomi = optional(of[Double])
  // Handicap stones for a challenge (unit 4.9): 0 even, 1 no stone with Black first, or 2 to 9 (R-HCP-1)
  val goHandicap = optional(number(min = 0, max = 9))
  // Byo-yomi periods and their length in seconds (unit 4.9); a form without them gets 5 × 30 s
  val periods = default(typeIn(ByoyomiPeriods.periodChoices.toSet), ByoyomiPeriods.default.periods)
  val periodTime = default(typeIn(ByoyomiPeriods.secondChoices.toSet), ByoyomiPeriods.default.seconds)
  val fenField = optional:
    import lila.common.Form.fen.{ mapping, truncateMoveNumber }
    mapping.transform[Fen.Full](truncateMoveNumber, identity)
