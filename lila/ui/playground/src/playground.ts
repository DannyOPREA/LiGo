import {
  attributesModule,
  classModule,
  eventListenersModule,
  init,
  propsModule,
  styleModule,
} from 'snabbdom';

import PlaygroundCtrl from './ctrl';
import type { PlaygroundConfig } from './interfaces';
import view from './view';

const patch = init([classModule, attributesModule, propsModule, eventListenersModule, styleModule]);

export function initModule(config: PlaygroundConfig = {}): void {
  const el = document.getElementById('playground')!;
  el.innerHTML = '';
  const inner = document.createElement('div');
  el.appendChild(inner);

  const ctrl = new PlaygroundCtrl(config, redraw);
  let vnode = patch(inner, view(ctrl));

  function redraw() {
    vnode = patch(vnode, view(ctrl));
  }
}
