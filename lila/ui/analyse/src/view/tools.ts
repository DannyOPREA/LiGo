import { view as cevalView } from 'lib/ceval';
import { hl, type LooseVNode, type VNode } from 'lib/view';

import type AnalyseCtrl from '@/ctrl';
import { view as forkView } from '@/fork';
import type { ConcealOf } from '@/interfaces';
import practiceView from '@/practice/practiceView';
import retroView from '@/retrospect/retroView';
import { renderResult, type ViewContext } from '@/view/components';

import { view as actionMenu } from './actionMenu';

export function renderTools({ ctrl, concealOf }: ViewContext, embeddedVideo?: LooseVNode) {
  const showCeval = ctrl.isCevalAllowed() && ctrl.showCeval();
  return hl('div.analyse__tools', [
    embeddedVideo,
    showCeval && cevalView.renderCeval(ctrl),
    showCeval && !ctrl.retro?.isSolving() && !ctrl.practice && cevalView.renderPvs(ctrl),
    renderMoveList(ctrl, concealOf),
    forkView(ctrl, concealOf),
    retroView(ctrl) || practiceView(ctrl),
    ctrl.actionMenu() && actionMenu(ctrl),
  ]);
}

const renderMoveList = (ctrl: AnalyseCtrl, concealOf?: ConcealOf): VNode =>
  hl('div.analyse__moves.areplay', { hook: ctrl.treeView.hook() }, [
    hl('div', [ctrl.treeView.render(concealOf), renderResult(ctrl)]),
  ]);
