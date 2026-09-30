import type { VNode } from 'snabbdom';

import { pubsub } from 'lib/pubsub';
import { snabDialog } from 'lib/view';

import type RoundController from './ctrl';
import { firstPly, lastPly } from './util';

export const prev = (ctrl: RoundController): void => ctrl.userJump(ctrl.ply - 1);

export const next = (ctrl: RoundController): void => ctrl.userJump(ctrl.ply + 1);

// The board takes its own keys while it has focus (libs/board, unit 9.4: arrows move its cursor,
// Enter plays, P passes) and keeps them from reaching these page keys.
export const init = (ctrl: RoundController): LichessMousetrap =>
  site.mousetrap
    .bind(['left', 'k'], () => {
      prev(ctrl);
      ctrl.redraw();
    })
    .bind(['right', 'j'], () => {
      next(ctrl);
      ctrl.redraw();
    })
    .bind(['up', '0', 'home'], () => {
      ctrl.userJump(firstPly(ctrl.data));
      ctrl.redraw();
    })
    .bind(['down', '$', 'end'], () => {
      ctrl.userJump(lastPly(ctrl.data));
      ctrl.redraw();
    })
    .bind('z', () => pubsub.emit('zen'))
    .bind('?', () => {
      ctrl.keyboardHelp = !ctrl.keyboardHelp;
      ctrl.redraw();
    })
    .bind('h', ctrl.menu.toggle);

export const view = (ctrl: RoundController): VNode =>
  snabDialog({
    class: 'help',
    htmlUrl: '/round/help',
    onClose() {
      ctrl.keyboardHelp = false;
      ctrl.redraw();
    },
    modal: true,
    easyClose: 'clickOutside',
  });
