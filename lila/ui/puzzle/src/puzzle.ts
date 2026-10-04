// The trainer page's module (lila `views.puzzle.ui.show`, unit 8.7): a Go puzzle on libs/board's puzzle
// board, in lila's layout. lila's chess page (chessground, the move test, hints, openings, the
// blind-mode view) went with chess; goban decides right and wrong.

import { attributesModule, classModule, init } from 'snabbdom';

import menuHover from 'lib/menuHover';

import PuzzleCtrl from './ctrl';
import type { PuzzleOpts } from './interfaces';
import view from './view/main';

const patch = init([classModule, attributesModule]);

export function initModule(opts: PuzzleOpts): { ctrl: PuzzleCtrl } {
  const element = document.querySelector('main.puzzle') as HTMLElement;
  let vnode: ReturnType<typeof patch> | undefined;
  const redraw = () => {
    if (vnode) vnode = patch(vnode, view(ctrl));
  };
  const ctrl = new PuzzleCtrl(opts, redraw);
  element.innerHTML = '';
  vnode = patch(element, view(ctrl));
  menuHover();
  return { ctrl };
}
