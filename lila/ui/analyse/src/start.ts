import type { VNode } from 'snabbdom';

import menuHover from 'lib/menuHover';

import makeCtrl from './ctrl';
import type { AnalyseApi, AnalyseOpts } from './interfaces';
import makeView from './view/main';

export default function (patch: (oldVnode: VNode | Element | DocumentFragment, vnode: VNode) => VNode) {
  return function (opts: AnalyseOpts): AnalyseApi {
    opts.element = document.querySelector('main.analyse') as HTMLElement;

    const ctrl = (site.analysis = new makeCtrl(opts, redraw));
    const view = makeView();

    const blueprint = view(ctrl);
    opts.element.innerHTML = '';
    let vnode = patch(opts.element, blueprint);

    function redraw() {
      vnode = patch(vnode, view(ctrl));
    }

    menuHover();

    return {
      socketReceive: ctrl.socket.receive,
      path: () => ctrl.path,
      setChapter() {},
    };
  };
}
