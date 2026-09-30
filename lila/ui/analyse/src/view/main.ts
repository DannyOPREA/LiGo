import { renderChat } from 'lib/chat/renderChat';
import { displayColumns } from 'lib/device';
import { playable } from 'lib/game';
import * as router from 'lib/game/router';
import { licon } from 'lib/licon';
import { type VNode, onInsert, hl } from 'lib/view';
import { watchers } from 'lib/view/watchers';

import crazyView from '@/crazy/crazyView';
import type AnalyseCtrl from '@/ctrl';
import forecastView from '@/forecast/forecastView';
import { view as keyboardView } from '@/keyboard';
import { wikiToggleBox } from '@/wiki';

import { viewContext, renderBoard, renderMain, renderUnderboard } from './components';
import { renderControls } from './controls';
import { render as trainingView } from './roundTraining';
import { renderTools } from './tools';

let resizeCache: {
  columns: number;
  chat: HTMLElement | null;
  board: HTMLElement | null;
  meta: HTMLElement | null;
};

export default function () {
  return function (ctrl: AnalyseCtrl): VNode {
    resizeCache ??= resizeHandler(ctrl);
    if (ctrl.nvui) return ctrl.nvui.render();
    else return analyseView(ctrl);
  };
}

function analyseView(ctrl: AnalyseCtrl): VNode {
  const ctx = viewContext(ctrl);
  return renderMain(
    ctx,
    ctrl.keyboardHelp && keyboardView(ctrl),
    renderBoard(ctx),
    crazyView(ctrl, ctrl.topColor(), 'top'),
    renderTools(ctx),
    crazyView(ctrl, ctrl.bottomColor(), 'bottom'),
    renderControls(ctrl),
    renderUnderboard(ctx),
    trainingView(ctrl),
    hl(
      'aside.analyse__side',
      {
        hook: onInsert(elm => {
          if (ctrl.opts.$side?.length) {
            $(elm).replaceWith(ctrl.opts.$side);
            wikiToggleBox();
          }
        }),
      },
      [
        ctrl.forecast && forecastView(ctrl, ctrl.forecast),
        !ctrl.synthetic &&
          playable(ctrl.data) &&
          hl(
            'div.back-to-game',
            hl(
              'a.button.button-empty.text',
              {
                attrs: {
                  href: router.game(ctrl.data, ctrl.data.player.color),
                  'data-icon': licon.Back,
                },
              },
              i18n.site.backToGame,
            ),
          ),
      ],
    ),
    ctrl.chatCtrl && renderChat(ctrl.chatCtrl, { insert: v => fixChatHeight(v.elm) }),
    hl('div.chat__members.none', { hook: onInsert(watchers) }),
  );
}

function resizeHandler(ctrl: AnalyseCtrl) {
  window.addEventListener('resize', () => {
    if (resizeCache.columns !== displayColumns()) ctrl.redraw();
    resizeCache.columns = displayColumns();

    if (resizeCache.columns < 3) return;

    resizeCache.chat ??= document.querySelector<HTMLElement>('.mchat');
    fixChatHeight(resizeCache.chat);
  });
  return { columns: displayColumns(), chat: null, board: null, meta: null };
}

function fixChatHeight(el: Node | null | undefined) {
  if (!(el instanceof HTMLElement)) return;
  resizeCache.board ??= document.querySelector<HTMLElement>('.analyse__board .cg-wrap');
  resizeCache.meta ??= document.querySelector<HTMLElement>('.game__meta');
  if (!resizeCache.board || !resizeCache.meta) return;
  el.style.height = `${resizeCache.board.offsetHeight - resizeCache.meta.offsetHeight - 16}px`;
}
