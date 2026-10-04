import { repeater, blurIfPrimaryClick } from 'lib';
import { licon, type LiconValue } from 'lib/licon';
import { addPointerListeners } from 'lib/pointer';
import { type VNode, onInsert, hl } from 'lib/view';

import type AnalyseCtrl from '../ctrl';

type Action = 'first' | 'prev' | 'next' | 'last' | 'menu';

export function renderControls(ctrl: AnalyseCtrl) {
  const canJumpPrev = ctrl.path !== '',
    canJumpNext = !!ctrl.node.children[0];

  return hl(
    'div.analyse__controls.analyse-controls',
    {
      hook: onInsert(el =>
        addPointerListeners(el, {
          click: e => clickControl(ctrl, e),
          hold: e => holdControl(ctrl, e),
        }),
      ),
    },
    [
      hl('div.jumps', [
        jumpButton(licon.JumpFirst, 'first', canJumpPrev),
        jumpButton(licon.LessThan, 'prev', canJumpPrev),
        jumpButton(licon.GreaterThan, 'next', canJumpNext),
        jumpButton(licon.JumpLast, 'last', ctrl.node !== ctrl.mainline[ctrl.mainline.length - 1]),
      ]),
      hl('button.fbt', {
        class: { active: ctrl.actionMenu() },
        attrs: { title: i18n.site.menu, 'data-act': 'menu', 'data-icon': licon.Hamburger },
      }),
    ],
  );
}

function holdControl(ctrl: AnalyseCtrl, e: PointerEvent) {
  if (!(e.target instanceof HTMLElement)) return;
  const action = e.target.closest<HTMLElement>('[data-act]')?.dataset.act as Action;
  if (action === 'prev' || action === 'next') {
    repeater(() => {
      ctrl.navigate[action]();
      ctrl.redraw();
    });
  } else clickControl(ctrl, e);
}

function clickControl(ctrl: AnalyseCtrl, e: PointerEvent) {
  if (!(e.target instanceof HTMLElement)) return;
  const action = e.target.closest<HTMLElement>('[data-act]')?.dataset.act as Action;
  if (!action) return;
  if (action === 'prev') ctrl.navigate.prev();
  else if (action === 'next') ctrl.navigate.next();
  else if (action === 'first') ctrl.navigate.first();
  else if (action === 'last') ctrl.navigate.last();
  else if (action === 'menu') ctrl.toggleActionMenu();
  // (unit 3.5) the engine and practice tabs are gone
  blurIfPrimaryClick(e);
  ctrl.redraw();
}

const jumpButton = (icon: LiconValue, effect: string, enabled: boolean): VNode =>
  hl('button.fbt.move', { attrs: { disabled: !enabled, 'data-act': effect, 'data-icon': icon } });
