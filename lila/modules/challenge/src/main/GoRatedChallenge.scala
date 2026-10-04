package lila.challenge

import ligo.gorules.Setup as GoSetup

import lila.rating.GoRating

/* LiGo: the handicap rule for a rated direct challenge (ADR 0021 §4, unit 5.7).
 * LiGo's own code, MIT (COPYING.md §2).
 *
 * A rated game may have handicap stones only when it is a challenge to a named
 * player: the stones must be GoRating's suggestion for the two players'
 * current ratings or one either way, and the lower-rated player takes Black.
 * The stones and colours are fixed here, when the challenge is sent. A casual
 * challenge keeps any stones and colour (unit 4.9). */
object GoRatedChallenge:

  /* The colour the challenger asked for, or the one the handicap gives them,
   * or why this rated challenge can't be sent. */
  def color(
      setup: GoSetup,
      rated: chess.Rated,
      asked: String,
      challenger: Option[lila.core.perf.Perf],
      challenged: Option[lila.core.perf.Perf]
  ): Either[String, String] =
    if rated.no || setup.handicap == 0 then Right(asked)
    else
      (challenger, challenged) match
        case (Some(c), Some(d)) =>
          val choices = GoRating.ratedStoneChoices(c, d, setup.size.lines)
          if choices.contains(setup.handicap) then Right(GoRating.handicapColor(c, d).name)
          else
            Left:
              if choices.sizeIs == 1 then s"A rated game between you two has ${choices.head} handicap stones"
              else s"A rated game between you two has ${choices.head} to ${choices.last} handicap stones"
        case _ => Left("A rated game with handicap stones needs a named opponent")
