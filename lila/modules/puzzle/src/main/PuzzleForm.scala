package lila.puzzle

import play.api.data.*
import play.api.data.Forms.*
import chess.Rated

import lila.common.Form.{ into, stringIn, typeIn, given }
import scalalib.model.Days

object PuzzleForm:

  case class RoundData(
      win: PuzzleWin,
      rated: Rated,
      replayDays: Option[Days]
  )

  case class ThemeVote(
      theme: String,
      vote: Option[Boolean]
  )

  case class ThemesVote(
      puzzleId: PuzzleId,
      themes: List[ThemeVote]
  )

  case class BatchThemesVotes(votes: List[ThemesVote])

  val round = Form(
    mapping(
      "win" -> of[PuzzleWin],
      "rated" -> boolean.into[Rated],
      "replayDays" -> optional(typeIn[Days](PuzzleDashboard.dayChoices.toSet))
    )(RoundData.apply)(unapply)
  )

  val vote = Form(
    single("vote" -> boolean)
  )

  val report = Form(
    single("reason" -> nonEmptyText(1, 2000))
  )

  val themeVote = Form(
    single("vote" -> optional(boolean))
  )

  lazy val batchVotes = Form:
    mapping(
      "votes" -> list(
        mapping(
          "puzzleId" -> nonEmptyText.into[PuzzleId],
          "themes" -> list(
            mapping(
              "theme" -> nonEmptyText,
              "vote" -> optional(boolean)
            )(ThemeVote.apply)(unapply)
          ).verifying("At least one theme", _.nonEmpty)
            .verifying("No more than 500", _.sizeIs <= 500)
        )(ThemesVote.apply)(unapply)
      )
    )(BatchThemesVotes.apply)(_.votes.some)

  val difficulty = Form(
    single("difficulty" -> stringIn(PuzzleDifficulty.all.map(_.key).toSet))
  )
