import { h } from 'snabbdom';

import { initMiniBoard } from 'lib/view';

import type SetupController from '@/setupCtrl';

export const fenInput = (ctrl: SetupController) => {
  if (ctrl.variant() !== 'fromPosition') return null;
  const fen = ctrl.fen();
  const pov = ctrl.color() === 'black' ? 'black' : 'white';
  return h('div.config-group', [
    h('div.fen__form', [
      h('input#fen-input', {
        attrs: { placeholder: i18n.site.pasteTheFenStringHere, value: fen },
        on: {
          input: (e: InputEvent) => {
            ctrl.fen((e.target as HTMLInputElement).value.replace(/_/g, ' ').trim());
            ctrl.validateFen();
          },
        },
        hook: { insert: ctrl.validateFen },
        class: { failure: ctrl.fenError },
      }),
    ]),
    h(
      'div.fen__board',
      !ctrl.lastValidFen || !ctrl.validFen()
        ? null
        : h('div.position.mini-board.cg-wrap.is2d', {
            attrs: { 'data-state': `${ctrl.lastValidFen},${pov}` },
            hook: {
              insert: vnode => initMiniBoard(vnode.elm as HTMLElement),
              update: vnode => initMiniBoard(vnode.elm as HTMLElement),
            },
          }),
    ),
  ]);
};
