import { displayColumns, isTouchDevice } from 'lib/device';
import type { TopOrBottom } from 'lib/game';
import { storage } from 'lib/storage';
import { type VNode, hl, bind } from 'lib/view';
import stepwiseScroll from 'lib/view/stepwiseScroll';

import type RoundController from '../ctrl';
import { next, prev, view } from '../keyboard';
import { renderTable } from './table';

/** The board: a square that libs/board fills (goban sizes itself from the element it draws in). */
function renderBoard(ctrl: RoundController): VNode {
  return hl('div.round__go-board', {
    hook: {
      insert: vnode => ctrl.board.attach(vnode.elm as HTMLElement),
      destroy: vnode => ctrl.board.detach(vnode.elm as HTMLElement),
    },
  });
}

/** Who plays which colour and the prisoners they hold, in the position shown. */
function renderPrisoners(ctrl: RoundController, position: TopOrBottom): VNode {
  const color = ctrl.playerAt(position).color;
  const n = ctrl.prisoners()[color];
  return hl(`div.material.material-${position}.go-prisoners`, [
    hl(`span.go-prisoners__stone.${color}`, { attrs: { 'aria-hidden': 'true' } }),
    hl('span.go-prisoners__color', color === 'black' ? i18n.site.black : i18n.site.white),
    hl('span.go-prisoners__count', i18n.site.goNbPrisoners(n, n)),
  ]);
}

export function main(ctrl: RoundController): VNode {
  return hl(
    'div.round__app.round__app--go',
    {
      class: {
        'swap-clock': isTouchDevice() && displayColumns() === 1 && storage.boolean('swapClock').get(),
      },
    },
    [
      hl(
        'div.round__app__board.main-board',
        {
          hook:
            'ontouchstart' in window || !storage.boolean('scrollMoves').getOrDefault(true)
              ? undefined
              : bind(
                  'wheel',
                  stepwiseScroll(
                    e => {
                      if (e.deltaY > 0) next(ctrl);
                      else if (e.deltaY < 0) prev(ctrl);
                      ctrl.redraw();
                    },
                    () => ctrl.isPlaying(),
                  ),
                  undefined,
                  false,
                ),
        },
        [
          ctrl.board.loadFailed
            ? hl('p.round__go-board-failed', i18n.site.goBoardFailedToLoad)
            : renderBoard(ctrl),
        ],
      ),
      ctrl.keyboardHelp && view(ctrl),
      renderPrisoners(ctrl, 'top'),
      renderTable(ctrl),
      renderPrisoners(ctrl, 'bottom'),
    ],
  );
}

export function endGameView(): void {
  const $body = $('body');
  if ($body.hasClass('zen-auto') && $body.hasClass('zen')) {
    $body.toggleClass('zen');
    window.dispatchEvent(new Event('resize'));
  }
}
