import type { VNode } from 'snabbdom';

import { pubsub } from 'lib/pubsub';
import { snabDialog } from 'lib/view';
import * as xhr from 'lib/xhr';

import type AnalyseCtrl from './ctrl';

export const keyToMouseEvent = (key: string, eventName: string, selector: string) =>
  window.site.mousetrap.bind(key, () =>
    $(selector).each(function (this: HTMLElement) {
      this.dispatchEvent(new MouseEvent(eventName));
    }),
  );

export const bind = (ctrl: AnalyseCtrl) => {
  addModifierKeyListeners(ctrl);
  const kbd = window.site.mousetrap;
  kbd
    .bind(['left', 'k'], () => {
      ctrl.navigate.prev();
      ctrl.redraw();
    })
    .bind(['right', 'j'], () => {
      ctrl.navigate.next();
      ctrl.redraw();
    })
    .bind(['up', '0', 'home'], e => {
      if (e.key === 'ArrowUp' && ctrl.fork.select('prev')) ctrl.setAutoShapes();
      else ctrl.navigate.first();
      ctrl.redraw();
    })
    .bind(['down', '$', 'end'], e => {
      if (e.key === 'ArrowDown' && ctrl.fork.select('next')) ctrl.setAutoShapes();
      else ctrl.navigate.last();
      ctrl.redraw();
    })
    .bind('shift+c', () => {
      ctrl.showComments = !ctrl.showComments;
      ctrl.treeView.requestAutoScroll('smooth');
      ctrl.redraw();
    })
    .bind('shift+i', () => ctrl.settings.set('inline', !ctrl.settings.inline));

  kbd
    .bind('h', () => {
      ctrl.toggleActionMenu();
      ctrl.redraw();
    })
    .bind('f', ctrl.flip)
    .bind('?', () => {
      ctrl.keyboardHelp = !ctrl.keyboardHelp;
      if (ctrl.keyboardHelp) pubsub.emit('analysis.closeAll');
      ctrl.redraw();
    })
    .bind('z', () => ctrl.settings.set('showStaticAnalysis', !ctrl.settings.showStaticAnalysis))
    .bind('a', () => ctrl.settings.set('showBestMoveArrows', !ctrl.settings.showBestMoveArrows))
    .bind('v', () => ctrl.settings.set('showVariationArrows', !ctrl.settings.showVariationArrows));
  // (unit 3.5) the engine keys (space, l, x) are gone
  kbd
    .bind(['shift+left', 'shift+k'], () => {
      ctrl.navigate.previousBranch();
      ctrl.redraw();
    })
    .bind(['shift+right', 'shift+j'], () => {
      ctrl.navigate.nextBranch();
      ctrl.redraw();
    })
    .bind('shift+down', () => {
      ctrl.userJumpIfCan(ctrl.idbTree.stepLine(ctrl.path, 'next'), true);
      ctrl.redraw();
    })
    .bind('shift+up', () => {
      ctrl.userJumpIfCan(ctrl.idbTree.stepLine(ctrl.path, 'prev'), true);
      ctrl.redraw();
    });
};

export const view = (ctrl: AnalyseCtrl): VNode =>
  snabDialog({
    class: 'help.keyboard-help',
    htmlUrl: xhr.url('/analysis/help', { study: false }),
    modal: true,
    easyClose: 'clickOutside',
    onClose() {
      ctrl.keyboardHelp = false;
      ctrl.redraw();
    },
  });

function addModifierKeyListeners(ctrl: AnalyseCtrl) {
  let modifierOnly = false;

  window.addEventListener('mousedown', () => (modifierOnly = false), { capture: true });

  document.addEventListener('keydown', e => {
    if (e.key === 'Shift' || e.key === 'Control') modifierOnly = !modifierOnly;
    else modifierOnly = false;
  });

  document.addEventListener('keyup', e => {
    if (!modifierOnly) return;
    modifierOnly = false;
    const isShift = e.key === 'Shift' && !document.activeElement?.classList.contains('mchat__say');

    if (isShift && ctrl.fork.select('next')) ctrl.setAutoShapes();
    else if (e.key === 'Control') ctrl.toggleDiscloseOf();
    ctrl.redraw();
  });
}
