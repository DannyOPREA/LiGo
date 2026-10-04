package lila.user
package ui

import lila.core.perf.{ PuzPerf, UserWithPerfs }
import lila.ui.*

import ScalatagsTemplate.{ *, given }
import scalalib.model.Days

final class UserShowSide(helpers: Helpers):
  import helpers.{ *, given }

  def apply(
      u: UserWithPerfs,
      rankMap: lila.core.rating.UserRankMap,
      active: Option[PerfKey]
  )(using ctx: Context) =

    def showPerf(perf: Perf, pk: PerfKey) =
      val isPuzzle = pk == PerfKey.puzzle
      a(
        dataIcon := pk.perfIcon,
        title := pk.perfDesc.txt(),
        cls := List(
          "empty" -> perf.isEmpty,
          "active" -> active.contains(pk)
        ),
        href := ctx.pref.showRatings.so:
          if isPuzzle
          then
            val other = ctx.isnt(u).option(u.username)
            routes.Puzzle.dashboard(Days(30), "home", other).url
          else routes.User.perfStat(u.username, pk).url
        ,
        span(
          h3(pk.perfTrans),
          if isPuzzle && lila.rating.ratingApi.dubiousPuzzle(u.perfs) && ctx.isnt(u) && ctx.pref.showRatings
          then st.rating(strong("?"))
          else
            st.rating(
              ctx.pref.showRatings.option(
                frag(
                  if perf.glicko.clueless then strong("?")
                  else if pk == PerfKey.go then strong(goRank(perf.intRating, perf.provisional))
                  else
                    strong(
                      perf.glicko.intRating,
                      perf.provisional.yes.option("?")
                    )
                  ,
                  " ",
                  perf.glicko.clueless.not.so(ratingProgress(perf.progress)),
                  " "
                )
              ),
              span(
                if pk == PerfKey.puzzle then trans.site.nbPuzzles.plural(perf.nb, perf.nb.localize)
                else trans.site.nbGames.plural(perf.nb, perf.nb.localize)
              )
            )
          ,
          rankMap.get(pk).ifTrue(ctx.pref.showRatings).map { rank =>
            span(cls := "rank", title := trans.site.rankIsUpdatedEveryNbMinutes.pluralSameTxt(15))(
              trans.site.rankX(rank.localize)
            )
          }
        ),
        ctx.pref.showRatings.option(iconTag(Icon.PlayTriangle))
      )

    div(cls := "side sub-ratings")(
      (!u.lame || ctx.is(u) || Granter.opt(_.AccountInfo)).option(
        frag(
          // LiGo: the one Go rating (ADR 0021 §1), shown as its rank (unit 5.6)
          showPerf(u.perfs.go, PerfKey.go),
          u.noBot.option(
            frag(
              hr,
              showPerf(u.perfs.puzzle, PerfKey.puzzle),
              showStorm(u.perfs.storm),
              showRacer(u.perfs.racer),
              showStreak(u.perfs.streak)
            )
          )
        )
      )
    )

  // Puzzle storm, racer and streak went in unit 3.4; old scores stay stored (ADR 0019) and still show
  // here, without links.
  private def showStorm(storm: PuzPerf)(using Translate) =
    a(
      dataIcon := Icon.Storm,
      cls := List(
        "empty" -> !storm.nonEmpty
      ),
      span(
        h3("Puzzle Storm"),
        st.rating(
          strong(storm.score),
          storm.nonEmpty.option(
            frag(
              " ",
              span(trans.storm.xRuns.plural(storm.runs, storm.runs.localize))
            )
          )
        )
      )
    )

  private def showRacer(racer: PuzPerf)(using Translate) =
    a(
      dataIcon := Icon.FlagChessboard,
      cls := List(
        "empty" -> !racer.nonEmpty
      ),
      span(
        h3("Puzzle Racer"),
        st.rating(
          strong(racer.score),
          racer.nonEmpty.option(
            frag(
              " ",
              span(trans.storm.xRuns.plural(racer.runs, racer.runs.localize))
            )
          )
        )
      )
    )

  private def showStreak(streak: PuzPerf)(using Translate) =
    a(
      dataIcon := Icon.ArrowThruApple,
      cls := List(
        "empty" -> !streak.nonEmpty
      ),
      span(
        h3("Puzzle Streak"),
        st.rating(
          strong(streak.score),
          streak.nonEmpty.option(
            frag(
              " ",
              span(trans.storm.xRuns.plural(streak.runs, streak.runs.localize))
            )
          )
        )
      )
    )
