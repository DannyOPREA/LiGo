import type { VNode, Hooks } from 'snabbdom';

import { defined } from 'lib';
import { throttle } from 'lib/async';
import { isTouchDevice } from 'lib/device';
import { addPointerListeners } from 'lib/pointer';
import type { TreePath } from 'lib/tree/types';
import { onInsert } from 'lib/view';

import type AnalyseCtrl from '@/ctrl';

import { renderContextMenu } from './contextMenu';
import { renderInlineView } from './inlineView';

/**
 * The move list: lila's inline tree view, where every move carries its number (a Go record is
 * read move by move, and a handicap game starts with White, so lila's two-column view of chess
 * move pairs doesn't fit, unit 7.4).
 */
export class TreeView {
  constructor(readonly ctrl: AnalyseCtrl) {}
  private autoScrollRequest: ScrollBehavior | false = false;

  render(): VNode {
    return renderInlineView(this.ctrl);
  }

  requestAutoScroll(request: ScrollBehavior | false) {
    this.autoScrollRequest = request;
  }

  hook(): Hooks {
    const { ctrl } = this;
    return {
      ...onInsert(el => {
        if (ctrl.path !== '') this.autoScrollRequest = 'instant';
        const ctxMenuCallback = (e: MouseEvent) => {
          renderContextMenu(e, ctrl, eventPath(e) ?? '');
          ctrl.redraw();
          return false;
        };
        if (site.debug) {
          el.ondblclick = ctxMenuCallback; // dont steal movelist right clicks from dev tools in debug
        } else {
          el.oncontextmenu = ctxMenuCallback; // otherwise, standard prod behavior
        }
        if (isTouchDevice()) {
          el.ondblclick = ctxMenuCallback;
          addPointerListeners(el, { hold: ctxMenuCallback });
        }
        el.addEventListener('pointerup', (e: PointerEvent) => {
          if (!(e.target instanceof HTMLElement)) return;
          if (defined(e.button) && e.button !== 0) return;
          const path = eventPath(e);
          if (path) ctrl.userJump(path);
          this.autoScrollRequest = false;
          ctrl.redraw();
        });
      }),
      postpatch: () => {
        if (this.autoScrollRequest) {
          autoScroll(this.autoScrollRequest);
          this.autoScrollRequest = false;
        }
      },
    };
  }
}

const eventPath = (e: MouseEvent): TreePath | null => {
  const target = e.target as HTMLElement;
  return target.getAttribute('p') || target.parentElement!.getAttribute('p');
};

const autoScroll = throttle(200, (behavior: ScrollBehavior = 'instant') => {
  const scrollView = document.querySelector<HTMLElement>('.analyse__moves')!;
  const moveEl = scrollView.querySelector<HTMLElement>('.active');
  if (!moveEl) return scrollView.scrollTo({ top: 0, behavior });
  const [move, view] = [moveEl.getBoundingClientRect(), scrollView.getBoundingClientRect()];
  const visibleHeight = Math.min(view.bottom, window.innerHeight) - Math.max(view.top, 0);
  scrollView.scrollTo({
    top: scrollView.scrollTop + move.top - view.top - (visibleHeight - move.height) / 2,
    behavior,
  });
});
