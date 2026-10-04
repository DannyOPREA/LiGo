import { type VNode, h } from 'snabbdom';

import { Coords } from 'lib/prefs';
import { type MaybeVNode, bind, hl } from 'lib/view';

import type PuzzleCtrl from '@/ctrl';
import { boardRatio } from '@/go';

import feedbackView from './feedback';
import { replay, puzzleBox, userBox, config } from './side';
import { controls as solutionControls, moveList } from './solution';
import theme from './theme';

/** The board: libs/board draws goban's puzzle board in the element, mounted by the host's hooks. */
function renderBoard(ctrl: PuzzleCtrl): VNode {
  return hl(
    'div.puzzle__board.main-board',
    { attrs: { style: `---ratio:${boardRatio(ctrl.data.puzzle, ctrl.opts.pref.coords !== Coords.Hidden)}` } },
    [
      ctrl.board.loadFailed
        ? hl('div.puzzle__go-board-failed', 'The board could not be loaded. Reload the page to try again.')
        : hl('div.puzzle__go-board', {
            class: { 'puzzle__go-board--static': ctrl.solutionOpen },
            hook: {
              insert: vnode => ctrl.board.attach(vnode.elm as HTMLElement),
              destroy: vnode => ctrl.board.detach(vnode.elm as HTMLElement),
            },
          }),
    ],
  );
}

/** Touch-confirm: the stone previewed on the board is played by this button (or a second tap on it). */
function renderControls(ctrl: PuzzleCtrl): MaybeVNode {
  if (ctrl.solutionOpen) return solutionControls(ctrl);
  if (!ctrl.confirm || ctrl.mode === 'view') return undefined;
  return hl('div.puzzle__controls.puzzle__confirm-row', [
    hl(
      'button.button.puzzle__confirm',
      {
        attrs: { disabled: !ctrl.movePending() || ctrl.lastFeedback === 'fail' },
        hook: bind('click', ctrl.confirmMove, ctrl.redraw),
      },
      i18n.site.confirmMove,
    ),
  ]);
}

export default function (ctrl: PuzzleCtrl): VNode {
  return hl(`main.puzzle.puzzle-${ctrl.data.replay ? 'replay' : 'play'}`, {}, [
    hl('aside.puzzle__side', [replay(ctrl), puzzleBox(ctrl), userBox(ctrl), theme(ctrl), config(ctrl)]),
    renderBoard(ctrl),
    // where the puzzle comes from (ADR 0025 §1)
    hl('p.puzzle__source', ctrl.data.puzzle.source),
    hl('div.puzzle__tools', [moveList(ctrl), feedbackView(ctrl)]),
    renderControls(ctrl),
    session(ctrl),
  ]);
}

function session(ctrl: PuzzleCtrl): MaybeVNode {
  const rounds = ctrl.session.get().rounds;

  if (!rounds.length) return undefined;

  const { id: currentId } = ctrl.data.puzzle;
  const { theme } = ctrl.session;

  return hl('div.puzzle__session', [
    rounds.map(({ id, result, ratingDiff }) => {
      const rd =
        ratingDiff && ctrl.opts.showRatings ? (ratingDiff > 0 ? '+' + ratingDiff : ratingDiff) : null;

      return h(
        `a.result-${result}`,
        {
          key: id,
          class: { current: currentId === id, 'result-empty': !rd },
          attrs: {
            href: `/training/${theme}/${id}`,
          },
        },
        rd,
      );
    }),
    rounds.some(r => r.id === currentId)
      ? hl('a.session-new', { key: 'new', attrs: { href: `/training/${theme}` } })
      : hl('a.result-cursor.current', {
          key: currentId,
          attrs: { href: `/training/${theme}/${currentId}` },
        }),
  ]);
}
