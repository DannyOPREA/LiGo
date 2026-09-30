package lila.web
package ui

import lila.ui.*

import ScalatagsTemplate.{ *, given }

val fideHandbookUrl = "https://handbook.fide.com/chapter/E012023"

final class FaqUi(helpers: Helpers, sitePages: SitePages)(
    standardRankableDeviation: Int,
    variantRankableDeviation: Int
):
  import helpers.{ given, * }
  import trans.faq as trf

  private def cmsPageUrl(key: String) = routes.Cms.lonePage(lila.core.id.CmsPageKey(key))

  private def question(id: String, title: String, answer: Frag*) =
    details(
      st.id := id,
      cls := "question",
      name := "faq"
    )(
      summary(span(title)),
      div(cls := "answer")(answer)
    )

  def apply(using Context) =
    sitePages
      .SitePage(
        title = "Frequently Asked Questions",
        active = "faq"
      )
      .css("bits.faq"):
        div(cls := "faq box box-pad")(
          h1(cls := "box__top")(trf.frequentlyAskedQuestions()),
          // LiGo (unit 3.8): LiGo's own questions replace lichess's name, contributing and "sites
          // based on Lichess" questions.
          h2(siteName),
          question(
            "what",
            trf.whatIsLiGo.txt(),
            p(
              trf.whatIsLiGoAnswer(
                a(href := "https://lichess.org")("lichess"),
                a(href := routes.Cms.source)(trans.site.sourceCode())
              )
            )
          ),
          question(
            "name",
            trf.whyIsLiGoCalledLiGo.txt(),
            p(trf.ligoNameExplanation())
          ),
          question(
            "built-from",
            trf.whatIsLiGoBuiltFrom.txt(),
            p(trf.ligoReusesFreeSoftware()),
            ul(
              li(trf.builtFromLichess(a(href := "https://github.com/lichess-org/lila")("lichess"))),
              li(
                trf.builtFromStrategygames(
                  a(href := "https://github.com/Mind-Sports-Games/strategygames")("strategygames")
                )
              ),
              li(trf.builtFromGoban(a(href := "https://github.com/online-go/goban")("goban"))),
              li(
                trf.builtFromKataGoAndGoscorer(
                  a(href := "https://github.com/lightvector/KataGo")("KataGo"),
                  a(href := "https://github.com/lightvector/goscorer")("goscorer")
                )
              )
            ),
            p(
              trf.otherSitesGrewFromLichess(
                a(href := "https://lishogi.org")("lishogi.org"),
                a(href := "https://lidraughts.org")("lidraughts.org"),
                a(href := "https://playstrategy.org")("playstrategy.org")
              )
            )
          ),
          question(
            "rules",
            trf.whichRulesDoesLiGoUse.txt(),
            p(trf.ligoRulesExplanation()),
            p(
              trf.rulesDetailsInX(
                a(href := s"${LigoBrand.repoUrl}/blob/${LigoBrand.repoBranch}/docs/rules/spec.md")(
                  trf.ligoRulesSpec()
                )
              )
            )
          ),
          question(
            "keyboard-shortcuts",
            trf.keyboardShortcuts.txt(),
            p(
              trf.keyboardShortcutsExplanation()
            )
          ),
          h2(trf.fairPlay()),
          question(
            "rating-refund",
            trf.whenAmIEligibleRatinRefund.txt(),
            p(
              trf.ratingRefundExplanation()
            )
          ),
          question(
            "leaving",
            trf.preventLeavingGameWithoutResigning.txt(),
            p(
              trf.leavingGameWithoutResigningExplanation()
            )
          ),
          question(
            "mod-application",
            trf.howCanIBecomeModerator.txt(),
            p(
              trf.youCannotApply()
            )
          ),
          // lichess's gameplay questions (time-control formula, variants, ACPL, insufficient
          // material, en passant, threefold repetition) went in unit 3.8: they are chess rules.
          h2(trf.accounts()),
          // the FIDE titles and "Lichess Master" questions went in unit 3.8.
          question(
            "usernames",
            trf.whatUsernameCanIchoose.txt(),
            p(
              trf.usernamesNotOffensive(
                a(href := cmsPageUrl("username-policy"))(trf.guidelines())
              )
            )
          ),
          question(
            "change-username",
            trf.canIChangeMyUsername.txt(),
            p(trf.usernamesCannotBeChanged.txt())
          ),
          // the lichess-only trophy question went in unit 3.8.
          h2(trf.lichessRatings()),
          question(
            "ratings",
            trf.whichRatingSystemUsedByLichess.txt(),
            p(
              trf.ratingSystemUsedByLichess()
            ),
            p(
              a(href := cmsPageUrl("rating-systems"))("More about rating systems")
            )
          ),
          question(
            "provisional",
            trf.whatIsProvisionalRating.txt(),
            p(trf.provisionalRatingExplanation()),
            ul(
              li(
                trf.notPlayedEnoughRatedGamesAgainstX(
                  em(trf.similarOpponents())
                )
              ),
              li(
                trf.notPlayedRecently()
              )
            ),
            p(
              trf.ratingDeviationMorethanOneHundredTen()
            )
          ),
          question(
            "leaderboards",
            trf.howDoLeaderoardsWork.txt(),
            p(
              trf.inOrderToAppearsYouMust(
                a(href := routes.User.list)(trf.ratingLeaderboards())
              )
            ),
            ol(
              li(trf.havePlayedMoreThanThirtyGamesInThatRating()),
              li(trf.havePlayedARatedGameAtLeastOneWeekAgo()),
              li(
                trf.ratingDeviationLowerThanXinChessYinVariants(
                  standardRankableDeviation,
                  variantRankableDeviation
                )
              ),
              li(trf.beInTopTen())
            ),
            p(
              trf.secondRequirementToStopOldPlayersTrustingLeaderboards()
            )
          ),
          question(
            "high-ratings",
            trf.whyAreRatingHigher.txt(),
            p(
              trf.whyAreRatingHigherExplanation()
            ),
            p(
              a(href := cmsPageUrl("rating-systems"))("More about rating systems")
            )
          ),
          question(
            "hide-ratings",
            trf.howToHideRatingWhilePlaying.txt(),
            p(
              trf.enableZenMode(
                a(href := routes.Pref.form("display"))(trf.displayPreferences()),
                em("z")
              )
            )
          ),
          question(
            "disconnection-loss",
            trf.connexionLostCanIGetMyRatingBack.txt(),
            p(
              trf.weCannotDoThatEvenIfItIsServerSideButThatsRare()
            )
          ),
          h2(trf.howToThreeDots()),
          question(
            "browser-notifications",
            trf.enableDisableNotificationPopUps.txt(),
            p(
              trf.lichessCanOptionnalySendPopUps()
            )
          ),
          question(
            "autoplay",
            trf.enableAutoplayForSoundsQ.txt(),
            p(trf.mostBrowsersPreventSoundAutoplay()),
            h3("Mozilla Firefox (", trf.desktop(), ")"),
            p(trf.enableAutoplayForSoundsFirefox()),
            h3("Google Chrome (", trf.desktop(), ")"),
            p(trf.enableAutoplayForSoundsChromeSiteInformation()),
            h3("Safari (", trf.desktop(), ")"),
            p(trf.enableAutoplayForSoundsSafari()),
            h3("Microsoft Edge (", trf.desktop(), ")"),
            p(trf.enableAutoplayForSoundsMicrosoftEdge())
          ),
          // "Make a Lichess bot?" went with the bots (units 3.5 and 3.8).
          question(
            "stop-chess-addiction",
            trf.stopMyselfFromPlaying.txt(),
            p(
              trf.adviceOnMitigatingAddiction(
                a(href := "https://getcoldturkey.com")("ColdTurkey"),
                a(href := "https://freedom.to")("Freedom"),
                a(href := "https://www.proginosko.com/leechblock")("LeechBlock"),
                a(href := cmsPageUrl("userstyles"))(trf.lichessUserstyles()),
                a(href := "https://github.com/ornicar/userstyles/blob/master/lichess.fewer-pools.user.css")(
                  trf.fewerLobbyPools()
                ),
                a(href := "https://icd.who.int/browse/2024-01/mms/en#1448597234")(trf.mentalHealthCondition())
              )
            )
          )
        )
