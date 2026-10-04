import { type VNode, bind, hl, type MaybeVNode } from 'lib/view';

import type PuzzleCtrl from '../ctrl';
import { goalText } from '../go';
import afterView from './after';

const viewSolution = (ctrl: PuzzleCtrl, retry = false): VNode =>
  hl('div.view_solution', { class: { show: ctrl.canViewSolution() } }, [
    retry && hl('button.button.puzzle__retry', { hook: bind('click', ctrl.retry) }, 'Try again'),
    hl(
      'button.button.button-empty.puzzle__view-solution',
      { hook: bind('click', ctrl.viewSolution) },
      i18n.site.viewTheSolution,
    ),
  ]);

const stone = (color: Color): VNode =>
  hl(`span.puzzle__stone.${color}`, { attrs: { 'aria-hidden': 'true' } });

const initial = (ctrl: PuzzleCtrl): VNode =>
  hl('div.puzzle__feedback.play', [
    hl('div.player', [
      hl('div.no-square', stone(ctrl.pov)),
      hl('div.instruction', [
        hl('strong', i18n.site.yourTurn),
        hl('em', i18n.puzzle[ctrl.pov === 'white' ? 'findTheBestMoveForWhite' : 'findTheBestMoveForBlack']),
        hl('em.puzzle__goal', goalText(ctrl.data.puzzle.goal, ctrl.pov)),
      ]),
    ]),
    viewSolution(ctrl),
  ]);

const good = (ctrl: PuzzleCtrl): VNode =>
  hl('div.puzzle__feedback.good', [
    hl('div.player', [
      hl('div.icon', '✓'),
      hl('div.instruction', [hl('strong', i18n.puzzle.bestMove), hl('em', i18n.puzzle.keepGoing)]),
    ]),
    viewSolution(ctrl),
  ]);

const fail = (ctrl: PuzzleCtrl): VNode =>
  hl('div.puzzle__feedback.fail', [
    hl('div.player', [
      hl('div.icon', '✗'),
      hl('div.instruction', [hl('strong', i18n.puzzle.notTheMove), hl('em', i18n.puzzle.trySomethingElse)]),
    ]),
    viewSolution(ctrl, true),
  ]);

export default function (ctrl: PuzzleCtrl): MaybeVNode {
  if (ctrl.mode === 'view') return afterView(ctrl);
  switch (ctrl.lastFeedback) {
    case 'init':
      return initial(ctrl);
    case 'good':
      return good(ctrl);
    case 'fail':
      return fail(ctrl);
  }
  return undefined;
}
