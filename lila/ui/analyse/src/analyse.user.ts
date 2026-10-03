// The analysis board page's module (lila `views.analyse.ui.userAnalysis`, unit 7.4): a Go board,
// lila's move tree and the SGF box, all in the browser. lila's chess analysis (its engine socket,
// the replay of a stored game) went with chess; a finished Go game opens here in unit 7.5.

import menuHover from 'lib/menuHover';

import AnalyseCtrl from './ctrl';
import type { AnalyseApi, AnalyseOpts } from './interfaces';
import view from './view/main';
import { patch } from './view/util';

export { patch };

export function initModule({
  cfg,
}: {
  cfg: Omit<AnalyseOpts, 'element'>;
}): AnalyseApi & { ctrl: AnalyseCtrl } {
  const element = document.querySelector('main.analyse') as HTMLElement;
  let vnode: ReturnType<typeof patch> | undefined;
  const redraw = () => {
    if (vnode) vnode = patch(vnode, view(ctrl));
  };
  const ctrl = new AnalyseCtrl({ ...cfg, element }, redraw);
  element.innerHTML = '';
  vnode = patch(element, view(ctrl));
  menuHover();
  return { ctrl, path: () => ctrl.path };
}
