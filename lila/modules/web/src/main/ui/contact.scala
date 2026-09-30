package lila.web
package ui

import lila.core.i18n.{ I18nKey as trans, Translate }
import lila.ui.*

import ScalatagsTemplate.{ *, given }

object contact:

  import trans.contact.*
  import navTree.*
  import navTree.Node.*

  def contactEmailLink(email: String)(using Translate) =
    bits.contactEmailLinkEmpty(email)(trans.site.clickToRevealEmailAddress())

  def apply(contactEmail: EmailAddress)(using Translate): Frag =
    frag(
      h1(cls := "box__top")(contactLichess()),
      div(cls := "nav-tree")(renderNode(menu(contactEmail), none))
    )

  private def reopenLeaf(prefix: String)(using Translate) =
    Leaf(
      s"$prefix-reopen",
      wantReopen(),
      frag(
        p(a(href := routes.Account.reopen)(reopenOnThisPage())),
        p(doNotAskByEmailToReopen())
      )
    )

  private def howToReportBugs(using Translate): Frag =
    frag(
      // LiGo (unit 3.8): LiGo's own issue tracker; lichess's mobile app and Discord links went.
      ul(
        li(
          a(href := s"${LigoBrand.repoUrl}/issues")(reportWebsiteIssue())
        )
      ),
      p(howToReportBug())
    )

  def menu(contactEmail: EmailAddress)(using Translate): Branch =
    Branch(
      "root",
      whatCanWeHelpYouWith(),
      List(
        Branch(
          "login",
          iCantLogIn(),
          List(
            Leaf(
              "email-confirm",
              noConfirmationEmail(),
              p(
                a(href := routes.Account.emailConfirmHelp)(visitThisPage()),
                "."
              )
            ),
            Leaf(
              "forgot-password",
              forgotPassword(),
              p(
                a(href := routes.Auth.passwordReset)(visitThisPage()),
                "."
              )
            ),
            Leaf(
              "forgot-username",
              forgotUsername(),
              p(
                a(href := routes.Auth.login)(youCanLoginWithEmail()),
                "."
              )
            ),
            Leaf(
              "lost-2fa",
              lost2FA(),
              p(a(href := routes.Auth.passwordReset)(doPasswordReset()), ".")
            ),
            reopenLeaf("login")
          )
        ),
        Branch(
          "account",
          accountSupport(),
          List(
            // title verification contact leaf removed with the title module (unit 3.3).
            Leaf(
              "close",
              wantCloseAccount(),
              frag(
                p(a(href := routes.Account.close)(closeYourAccount()), "."),
                p(doNotAskByEmail())
              )
            ),
            reopenLeaf("account"),
            Leaf(
              "change-username",
              wantChangeUsername(),
              frag(
                p(a(href := routes.Account.username)(changeUsernameCase()), "."),
                p(cantChangeMore()),
                p(orCloseAccount())
              )
            ),
            Leaf(
              "clear-history",
              wantClearHistory(),
              frag(
                p(cantClearHistoryOrResetRatings()),
                p(orCloseAccount())
              )
            )
          )
        ),
        Leaf(
          "report",
          wantReport(),
          frag(
            p(
              a(href := routes.Report.form)(toReportAPlayerUseForm()),
              "."
            ),
            p(
              youCanAlsoReachReportPage(
                button(cls := "thin button button-empty", dataIcon := Icon.CautionTriangle)
              )
            ),
            p(
              doNotMessageModerators(),
              br,
              doNotReportInForum(),
              br,
              doNotSendReportEmails(),
              br,
              onlyReports()
            )
          )
        ),
        Branch(
          "bug",
          wantReportBug(),
          List(
            Leaf(
              "enpassant",
              illegalPawnCapture(),
              frag(
                p(calledEnPassant()),
                p(tryEnPassant())
              )
            ),
            Leaf(
              "castling",
              illegalCastling(),
              frag(
                p(castlingPrevented()),
                p(a(href := "https://en.wikipedia.org/wiki/Castling#Requirements")(castlingRules()), "."),
                p(tryCastling(), "."),
                p(castlingImported())
              )
            ),
            Leaf(
              "insufficient",
              insufficientMaterial(),
              frag(
                p(a(href := fideHandbookUrl)(fideMate()), "."),
                p(knightMate())
              )
            ),
            Leaf(
              "casual",
              noRatingPoints(),
              frag(
                p(ratedGame()),
                botRatingAbuse()
              )
            ),
            Leaf(
              "error-page",
              errorPage(),
              frag(
                p(reportErrorPage()),
                howToReportBugs
              )
            ),
            Leaf(
              "security",
              "Security vulnerability",
              p(
                "Please report it privately through ",
                a(href := s"${LigoBrand.repoUrl}/security")("the LiGo repository's security page"),
                ", not in a public issue."
              )
            ),
            Leaf(
              "other-bug",
              "Other bug",
              frag(
                p("If you found a new bug, you may report it:"),
                howToReportBugs
              )
            )
          )
        ),
        frag(
          p(doNotMessageModerators()),
          p(sendAppealTo(a(href := routes.Appeal.home)(routes.Appeal.home.url))),
          p(
            falsePositives(),
            br,
            ifLegit()
          )
        ).pipe { appealBase =>
          Branch(
            "appeal",
            banAppeal(),
            List(
              Leaf(
                "appeal-cheat",
                engineAppeal(),
                frag(
                  appealBase,
                  p(
                    accountLost(),
                    br,
                    doNotDeny()
                  )
                )
              ),
              Leaf(
                "appeal-other",
                otherRestriction(),
                appealBase
              )
            )
          )
        },
        Branch(
          "collab",
          collaboration(),
          List(
            Leaf(
              "gdpr",
              "GDPR erasure",
              p(
                "You may request the ",
                a(href := routes.Account.delete)("complete deletion of your LiGo account.")
              )
            ),
            Leaf(
              "dmca",
              "DMCA / Intellectual Property Take Down Notice",
              p(
                a(href := "/dmca")("Complete this form"),
                " ",
                "if you are the original copyright holder, or an agent acting on behalf of the copyright holder, and believe LiGo is hosting work(s) you hold the copyright to."
              )
            ),
            // "Broadcast a tournament" went with broadcasts (units 3.3 and 3.8).
            Leaf(
              "authorize",
              authorizationToUse(),
              frag(
                p(welcomeToUse()),
                p(videosAndBooks()),
                p(creditAppreciated())
              )
            ),
            Leaf(
              "monetize",
              monetizing(),
              frag(
                p(monetiseNotInterested()),
                p(
                  monetiseNoAdsTrackingOrTraffic()
                ),
                p(monetiseNoMarketingEmail())
                // the "block all ads" link to lichess's /ads page went in unit 3.8.
              )
            ),
            // "Buying Lichess" went in unit 3.8: LiGo may be handed to OGS one day (docs/PLAN.md).
            Leaf(
              "contact-other",
              noneOfTheAbove(),
              frag(
                p(sendEmailAt(contactEmailLink(contactEmail.value))),
                p(explainYourRequest())
              )
            )
          )
        )
      )
    )
