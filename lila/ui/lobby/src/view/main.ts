import { type VNodeData } from 'snabbdom';

import { div, spinnerVdom as spinner } from 'lib/view';

import type LobbyController from '../ctrl';
import renderOpen from './openChallenges';
import renderPlaying from './playing';
import * as renderPools from './pools';
import renderTabs from './tabs';

export default function (ctrl: LobbyController) {
  let body;
  let data: VNodeData = {};
  const redirBlock = ctrl.redirecting && ctrl.tab !== 'pools';
  if (redirBlock) body = spinner();
  else
    switch (ctrl.tab) {
      case 'pools':
        body = renderPools.render(ctrl);
        data = { hook: renderPools.hooks(ctrl) };
        break;
      case 'open':
        body = renderOpen(ctrl);
        break;
      case 'now_playing':
        body = renderPlaying(ctrl);
        break;
    }
  const contentKey = ctrl.tab === 'open' ? `${ctrl.tab}-${ctrl.mode}` : ctrl.tab;
  return div(`.lobby__app.lobby__app-${ctrl.tab}.lck-${contentKey}`, [
    div('.tabs-horiz', { role: 'tablist' }, renderTabs(ctrl)),
    div(`.lobby__app__content.l${redirBlock ? 'redir' : ctrl.tab}`, data, body),
  ]);
}
