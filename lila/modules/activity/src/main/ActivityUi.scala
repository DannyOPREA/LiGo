package lila.activity
package ui

import lila.activity.activities.*
import lila.core.perf.UserWithPerfs
import lila.core.rating.{ RatingProg, Score }
import lila.core.game.{ LightPlayer, LightPov }
import lila.rating.UserPerfsExt.dubiousPuzzle
import lila.ui.*
import lila.ui.ScalatagsTemplate.{ *, given }

final class ActivityUi(helpers: Helpers):
  import helpers.{ *, given }

  def apply(u: UserWithPerfs, as: Iterable[ActivityView])(using Context) =
    div(cls := "activity")(
      as.toSeq
        .filterNot(_.isEmpty)
        .map: a =>
          st.section(
            h2(semanticDate(a.interval.start)),
            div(cls := "entries")(
              a.patron.map(renderPatron),
              a.puzzles.map(renderPuzzles(u)),
              a.storm.map(renderStorm),
              a.racer.map(renderRacer),
              a.streak.map(renderStreak),
              a.games.map(renderGames),
              a.corresMoves.map(renderCorresMoves),
              a.corresEnds.map(renderCorresEnds),
              a.follows.map(renderFollows),
              a.stream.option(renderStream(u.user)),
              a.signup.option(renderSignup)
            )
          )
    )

  private def subCount(count: Int) = if count >= maxSubEntries then s"$count+" else s"$count"

  private def renderPatron(p: Patron)(using Context) =
    div(cls := "entry plan")(
      iconTag(Icon.Wings),
      div(
        if p.months == 0 then a(href := routes.Plan.index())("Lifetime Patron!")
        else
          trans.activity.supportedNbMonths
            .plural(p.months, p.months, a(href := routes.Plan.index())("Patron"))
      )
    )

  private def renderPuzzles(u: UserWithPerfs)(p: Puzzles)(using ctx: Context) =
    entryTag(
      iconTag(Icon.ArcheryTarget),
      div(
        trans.activity.solvedNbPuzzles.pluralSame(p.value.size),
        p.value.rp.filterNot(_.isEmpty || (u.perfs.dubiousPuzzle && ctx.isnt(u))).map(ratingProgFrag)
      ),
      scoreFrag(p.value)
    )

  private def renderStorm(s: Storm)(using Context) =
    entryTag(
      iconTag(Icon.Storm),
      div(
        trans.storm.playedNbRunsOfPuzzleStorm
          .plural(s.runs, s.runs.localize, "Puzzle Storm")
      ),
      scoreTag(winTag(trans.storm.highscoreX(strong(s.score))))
    )

  private def renderRacer(s: Racer)(using Context) =
    entryTag(
      iconTag(Icon.FlagChessboard),
      div(
        trans.storm.playedNbRunsOfPuzzleStorm
          .plural(s.runs, s.runs.localize, "Puzzle Racer")
      ),
      scoreTag(winTag(trans.storm.highscoreX(strong(s.score))))
    )

  private def renderStreak(s: Streak)(using Context) =
    entryTag(
      iconTag(Icon.ArrowThruApple),
      div(
        trans.storm.playedNbRunsOfPuzzleStorm
          .plural(s.runs, s.runs.localize, "Puzzle Streak")
      ),
      scoreTag(winTag(trans.storm.highscoreX(strong(s.score))))
    )

  private def renderGames(games: Games)(using Context) =
    games.value.toSeq.sortBy(-_._2.size).map { (pk, score) =>
      val pt = lila.rating.PerfType(pk)
      entryTag(
        iconTag(pt.icon),
        div(
          trans.activity.playedNbGames.plural(score.size, score.size, pt.trans),
          score.rp.filterNot(_.isEmpty).map(ratingProgFrag)
        ),
        scoreFrag(score)
      )
    }

  private def renderCorresMoves(nb: Int, povs: List[LightPov])(using Context) =
    entryTag(
      iconTag(Icon.PaperAirplane),
      div(
        trans.activity.playedNbMoves.pluralSame(nb),
        " ",
        trans.activity.inNbCorrespondenceGames.plural(povs.size, subCount(povs.size)),
        subTag(
          povs.map: pov =>
            frag(
              a(cls := "glpt", href := routes.Round.watcher(pov.gameId, pov.color))("Game"),
              " vs ",
              lightPlayerLink(pov.opponent),
              br
            )
        )
      )
    )

  private def renderCorresEnds(corresEnds: Map[PerfKey, (Score, List[LightPov])])(using
      Context
  ) =
    corresEnds.toSeq.map { case (pk, (score, povs)) =>
      val pt = lila.rating.PerfType(pk)
      val text =
        if pk == PerfKey.correspondence then
          trans.activity.completedNbGames.plural(score.size, subCount(score.size))
        else
          trans.activity.completedNbVariantGames.plural(
            score.size,
            subCount(score.size),
            pt.trans
          )
      entryTag(
        iconTag(if pk == PerfKey.correspondence then Icon.PaperAirplane else pt.icon),
        div(
          text,
          score.rp.filterNot(_.isEmpty).map(ratingProgFrag),
          scoreFrag(score),
          subTag(
            povs.map: pov =>
              frag(
                a(cls := "glpt", href := routes.Round.watcher(pov.gameId, pov.color))(
                  pov.game.win.map(_ == pov.color) match
                    case Some(true) => trans.site.victory()
                    case Some(false) => trans.site.defeat()
                    case _ => "Draw"
                ),
                " vs ",
                lightPlayerLink(pov.opponent),
                br
              )
          )
        )
      )
    }

  private def renderFollows(all: Follows)(using Context) =
    entryTag(
      iconTag(Icon.ThumbsUp),
      div(
        List(all.in.map(_ -> true), all.out.map(_ -> false)).flatten.map { (f, in) =>
          frag(
            if in then trans.activity.gainedNbFollowers.pluralSame(f.actualNb)
            else trans.activity.followedNbPlayers.pluralSame(f.actualNb),
            subTag(
              fragList(f.ids.map(id => userIdLink(id.some))),
              f.nb.map { nb =>
                frag(" and ", nb - maxSubEntries, " more")
              }
            )
          )
        }
      )
    )


  private def renderStream(u: User)(using ctx: Context) =
    ctx.kid.no.option(
      entryTag(
        iconTag(Icon.Mic),
        a(href := routes.Streamer.show(u.username, true))(trans.activity.hostedALiveStream())
      )
    )

  private def renderSignup(using Context) =
    entryTag(
      iconTag(Icon.StarOutline),
      div(trans.activity.signedUp())
    )

  val entryTag = div(cls := "entry")
  val subTag = div(cls := "sub")
  private val scoreTag = tag("score")
  private val winTag = tag("win")

  private def scoreFrag(s: Score)(using Context) = raw:
    s"""<score>${scoreStr("win", s.win, trans.site.nbWins)}${scoreStr(
        "draw",
        s.draw,
        trans.site.nbDraws
      )}${scoreStr(
        "loss",
        s.loss,
        trans.site.nbLosses
      )}</score>"""

  private def ratingProgFrag(r: RatingProg)(using ctx: Context) =
    ctx.pref.showRatings.option(ratingTag(r.after.value, ratingProgress(r.diff)))

  private def scoreStr(tag: String, p: Int, name: lila.core.i18n.I18nKey)(using Translate) =
    if p == 0 then ""
    else s"""<$tag>${wrapNumber(name.pluralSameTxt(p))}</$tag>"""

  private val wrapNumberRegex = """(\d++)""".r
  private def wrapNumber(str: String) = wrapNumberRegex.replaceAllIn(str, "<strong>$1</strong>")

  private def lightPlayerLink(player: LightPlayer)(using ctx: Context): Frag =
    player.userId.flatMap(lightUserSync) match
      case None =>
        span(cls := "user-link")(
          player.aiLevel.fold(trans.site.anonymous())(aiNameFrag),
          player.rating.ifTrue(ctx.pref.showRatings).map { rating => s" ($rating)" }
        )
      case Some(user) =>
        a(
          cls := userClass(user.id, none, true),
          href := routes.User.show(user.name)
        )(
          lineIcon(user),
          " ",
          playerUsername(
            player,
            user.some,
            withRating = ctx.pref.showRatings
          )
        )
