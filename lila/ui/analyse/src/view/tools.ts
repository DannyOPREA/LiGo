import { hl, type LooseVNode, type VNode } from 'lib/view';

import type AnalyseCtrl from '@/ctrl';
import { view as forkView } from '@/fork';
import type { ConcealOf } from '@/interfaces';
import { renderResult, type ViewContext } from '@/view/components';

import { view as actionMenu } from './actionMenu';

export function renderTools({ ctrl, concealOf }: ViewContext, embeddedVideo?: LooseVNode) {
  return hl('div.analyse__tools', [
    embeddedVideo,
    renderMoveList(ctrl, concealOf),
    forkView(ctrl, concealOf),
    ctrl.actionMenu() && actionMenu(ctrl),
  ]);
}

const renderMoveList = (ctrl: AnalyseCtrl, concealOf?: ConcealOf): VNode =>
  hl('div.analyse__moves.areplay', { hook: ctrl.treeView.hook() }, [
    hl('div', [ctrl.treeView.render(concealOf), renderResult(ctrl)]),
  ]);
