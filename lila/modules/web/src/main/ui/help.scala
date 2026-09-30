package lila.web
package ui

import lila.core.i18n.{ I18nKey as trans, Translate }
import lila.ui.*

import ScalatagsTemplate.*

object help:

  private def header(text: Frag) = tr(th(colspan := 2)(p(text)))
  private def row(keys: Frag, desc: Frag) = tr(td(cls := "keys")(keys), td(cls := "desc")(desc))
  private val or = tag("or")("/")
  private val alt = span(cls := "kbd-mod")("or")
  private val tap = span(cls := "kbd-mod")("tap")
  private val kbd = tag("kbd")

  private def navigateMoves(using Translate) = frag(
    header(trans.site.moveListNavigation()),
    row(
      frag(kbd("←"), or, kbd("→"), alt, kbd("k"), or, kbd("j")),
      trans.site.keyMoveBackwardOrForward()
    ),
    row(
      frag(kbd("↑"), or, kbd("↓"), alt, kbd("0"), or, kbd("$"), alt, kbd("home"), or, kbd("end")),
      trans.site.keyGoToStartOrEnd()
    )
  )
  private def flip(using Translate) = row(kbd("f"), trans.site.flipBoard())
  private def zen(using Translate) = row(kbd("z"), trans.preferences.zenMode())
  private def helpDialog(using Translate) = row(kbd("?"), trans.site.showHelpDialog())
  private def menu(using Translate) = row(kbd("h"), trans.site.menu())

  // The Go board's own keys (libs/board, unit 9.4), once Tab has put the focus on it. English until the
  // board's words reach lila's translations (unit 9.7).
  private def goBoard = frag(
    header("On the board (Tab to reach it)"),
    row(frag(kbd("←"), kbd("→"), kbd("↑"), kbd("↓")), "Move the cursor"),
    row(frag(kbd("Enter"), or, kbd("Space")), "Play a stone at the cursor"),
    row(kbd("p"), "Pass"),
    row(kbd("d"), "Describe the point"),
    row(kbd("Esc"), "Take back a stone waiting to be confirmed")
  )

  def round(hasChat: Boolean)(using Translate) =
    frag(
      h2(trans.site.keyboardShortcuts()),
      table(
        tbody(
          navigateMoves,
          goBoard,
          header(trans.site.other()),
          zen,
          hasChat.option(
            row(kbd("c"), trans.site.focusChat())
          ),
          menu,
          helpDialog
        )
      )
    )
  def puzzle(using Translate) =
    frag(
      h2(trans.site.keyboardShortcuts()),
      table(
        tbody(
          navigateMoves,
          header(trans.site.analysisOptions()),
          row(kbd("n"), trans.puzzle.nextPuzzle()),
          header(trans.site.other()),
          flip,
          zen,
          menu,
          helpDialog
        )
      )
    )
  def analyse(isStudy: Boolean)(using Translate) =
    frag(
      h2(trans.site.keyboardShortcuts()),
      table(
        tbody(
          row(
            frag(kbd("↑"), or, kbd("↓"), alt, kbd("0"), or, kbd("$"), alt, kbd("home"), or, kbd("end")),
            trans.site.keyGoToStartOrEnd()
          ),
          row(
            frag(kbd("←"), or, kbd("→"), alt, kbd("k"), or, kbd("j")),
            trans.site.keyMoveBackwardOrForward()
          ),
          row(frag(tap, kbd("shift"), alt, kbd("↑"), or, kbd("↓")), trans.site.keyCycleSelectedVariation()),
          row(
            frag(kbd("shift"), kbd("←"), or, kbd("k"), alt, kbd("shift"), kbd("→"), or, kbd("j")),
            frag(trans.site.keyPreviousBranch(), " / ", trans.site.keyNextBranch())
          ),
          row(
            frag(kbd("shift"), kbd("↑"), alt, kbd("shift"), kbd("↓")),
            trans.site.keyGoToPreviousOrNextLine()
          ),
          row(frag(tap, kbd("ctrl")), trans.site.keyShowOrHideCurrentVariation()),
          header(trans.site.analysisOptions()),
          flip,
          row(kbd("z"), trans.site.toggleAllAnalysis()),
          row(kbd("a"), trans.site.bestMoveArrow()),
          row(kbd("v"), trans.site.toggleVariationArrows()),
          row(kbd("c"), trans.site.focusChat()),
          helpDialog,
          menu,
          row(frag(kbd("shift"), kbd("C")), trans.site.keyShowOrHideComments()),
          row(frag(kbd("shift"), kbd("I")), trans.site.inlineNotation()),
          isStudy.option(
            frag(
              header(trans.study.studyActions()),
              row(kbd("d"), trans.study.commentThisPosition()),
              row(kbd("g"), trans.study.annotateWithGlyphs()),
              row(kbd("n"), trans.study.nextChapter()),
              row(kbd("p"), trans.study.prevChapter()),
              row(frag((1 to 8).map(kbd(_))), trans.site.toggleGlyphAnnotations()),
              row(
                frag(kbd("shift"), (1 to 8).map(kbd(_))),
                trans.site.togglePositionAnnotations()
              ),
              row(
                frag(kbd("ctrl"), kbd("shift"), (1 to 8).map(kbd(_))),
                trans.site.toggleObservationAnnotations()
              ),
              row(frag(kbd("ctrl"), kbd("z")), "Undo arrow changes"),
              row(frag(kbd("shift"), kbd("S")), trans.site.search()),
              row(frag(kbd("shift"), kbd("H")), trans.study.editStudy()),
              row(frag(kbd("shift"), kbd("E")), trans.study.editChapter()),
              row(frag(kbd("shift"), kbd("N")), trans.study.addNewChapter())
            )
          ),
          header(trans.site.mouseTricks()),
          tr(
            td(cls := "mouse", colspan := 2)(
              ul(
                li(trans.site.youCanAlsoScrollOverTheBoardToMoveInTheGame()),
                li(trans.site.scrollOverComputerVariationsToPreviewThem()),
                li(
                  trans.site.analysisShapesHowTo(),
                  ul(
                    li(trans.site.primaryColorArrowsHowTo())
                  )
                )
              )
            )
          )
        )
      )
    )
