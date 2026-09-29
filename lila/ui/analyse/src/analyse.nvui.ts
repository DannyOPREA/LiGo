import { type NvuiContext, makeContext } from 'lib/nvui/chess';

import type AnalyseCtrl from './ctrl';
import type { NvuiPlugin } from './interfaces';
import { renderNvui, initNvui } from './view/nvuiView';

export type AnalyseNvuiContext = NvuiContext &
  Readonly<{
    ctrl: AnalyseCtrl;
  }>;

export function initModule(ctrl: AnalyseCtrl): NvuiPlugin {
  const ctx = makeContext<AnalyseNvuiContext>({ ctrl }, ctrl.redraw);
  initNvui(ctx);
  return { render: () => renderNvui(ctx) };
}
