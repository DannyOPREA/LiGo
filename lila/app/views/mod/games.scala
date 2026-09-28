package views.mod

import play.api.data.Form

import lila.app.UiEnv.{ *, given }
import lila.evaluation.PlayerAssessment
import lila.game.GameExt.*
import lila.mod.GameMod
import lila.mod.ui.ModUserTableUi.sortNoneTh

def games(
    user: User,
    filterForm: Form[GameMod.Filter],
    games: Either[List[Pov], List[(Pov, Either[PlayerAssessment, PlayerAssessment.Basics])]]
)(using Context) =
  Page(s"${user.username} games")
    .css("mod.games")
    .js(Esm("mod.games")):
      main(cls := "mod-games box")(
        boxTop(
          h1(userLink(user, params = "?mod"), " games"),
          div(cls := "box__top__actions")(
            form(method := "get", action := routes.GameMod.index(user.id), cls := "mod-games__filter-form")(
              form3.input(filterForm("opponents"))(placeholder := "Opponents"),
              form3.input(filterForm("nbGamesOpt"))(placeholder := "Nb games"),
              form3.select(
                filterForm("perf"),
                lila.rating.PerfType.nonPuzzle.map: p =>
                  p.key -> p.trans,
                "Variant".some
              )
            )
          )
        ),
        postForm(action := routes.GameMod.post(user.id), cls := "mod-games__analysis-form")(
          isGranted(_.UserEvaluate).option(
            submitButton(
              cls := "button button-empty button-thin",
              name := "action",
              value := "analyse"
            )("Analyse selected")
          ),
          submitButton(cls := "button button-empty button-thin", name := "action", value := "pgn")(
            "Download PGN"
          ),
          table(cls := "mod-games game-list slist")(
            thead(
              tr(
                sortNoneTh(
                  input(
                    tpe := "checkbox",
                    name := "game[]",
                    st.value := "all"
                  )
                ),
                thSortNumber("Opponent"),
                thSortNumber("Speed"),
                th(iconTag(Icon.Trophy)),
                thSortNumber("Moves"),
                thSortNumber("Result"),
                thSortNumber("ACPL", br, "(Avg ± SD)"),
                thSortNumber("Times", br, "(Avg ± SD)"),
                thSortNumber("Blur"),
                thSortNumber(dataSortDefault)("Date")
              )
            ),
            tbody(
              games.fold(_.map(_ -> None), _.map { (pov, ass) => pov -> Some(ass) }).map {
                case (pov, assessment) =>
                  val analysable = lila.game.GameExt.analysable(pov.game)
                  tr(
                    td(cls := analysable.option("input")):
                      analysable.option:
                        input(
                          tpe := "checkbox",
                          name := s"game[]",
                          st.value := pov.gameId
                        )
                    ,
                    td(dataSort := pov.opponent.rating.so(_.value))(
                      playerLink(pov.opponent, withDiff = false, mod = true)
                    ),
                    td(
                      dataSort := pov.game.clock.fold(
                        pov.game.correspondenceClock.fold(Int.MaxValue)(_.daysPerTurn * 3600 * 24)
                      )(_.config.estimateTotalSeconds)
                    )(
                      iconTag(pov.game.perfType.icon)(cls := "text"),
                      shortClockName(pov.game)
                    ),
                    // tournamentId/swissId are neutral fields kept in game storage (unit 3.2); no
                    // tournament or swiss feature exists to link to any more.
                    td,
                    td(dataSort := pov.moves)(pov.moves),
                    td(dataSort := ~pov.player.ratingDiff)(
                      pov.win match
                        case Some(true) => goodTag(cls := "result")("1")
                        case Some(false) => badTag(cls := "result")("0")
                        case None => span(cls := "result")("½")
                      ,
                      pov.player.ratingDiff match
                        case Some(d) if d.positive => goodTag(s"+$d")
                        case Some(d) if d.negative => badTag(d)
                        case _ => span("-")
                    ),
                    assessment match
                      case Some(Left(full)) => td(dataSort := full.analysis.avg)(full.analysis.toString)
                      case _ => td
                    ,
                    assessment match
                      case Some(ass) =>
                        val basics = ass.fold(_.basics, identity)
                        frag(
                          td(dataSort := basics.moveTimes.sd)(
                            s"${basics.moveTimes / 10}",
                            basics.mtStreak.so(frag(br, "streak"))
                          ),
                          td(dataSort := basics.blurs)(
                            s"${basics.blurs}%",
                            basics.blurStreak.filter(8 <=).map { s =>
                              frag(br, s"streak $s/12")
                            }
                          )
                        )
                      case _ => frag(td, td)
                    ,
                    td(dataSort := pov.game.movedAt.toSeconds.toString):
                      a(href := routes.Round.watcher(pov.gameId, pov.color), cls := "glpt"):
                        pastMomentServerText(pov.game.movedAt)
                  )
              }
            )
          )
        )
      )
