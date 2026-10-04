import { licon } from 'lib/licon';
import { bind, hl, type VNode } from 'lib/view';

import type { AutoplayDelay } from '@/autoplay';
import type AnalyseCtrl from '@/ctrl';

interface AutoplaySpeed {
  name: 'fast' | 'slow';
  delay: AutoplayDelay;
}

const speeds: AutoplaySpeed[] = [
  { name: 'fast', delay: 1000 },
  { name: 'slow', delay: 5000 },
];

const autoplayButtons = (ctrl: AnalyseCtrl): VNode =>
  hl(
    'div.autoplay',
    speeds.map(speed => {
      const active = ctrl.autoplay.getDelay() === speed.delay;
      return hl(
        'a.button',
        {
          class: { active, 'button-empty': !active },
          hook: bind('click', () => ctrl.togglePlay(speed.delay), ctrl.redraw),
        },
        i18n.site[speed.name],
      );
    }),
  );

/** lila's analysis menu, for Go: a new position, the SGF download, and the replay speeds. */
export function view(ctrl: AnalyseCtrl): VNode {
  return hl('div.action-menu.sub-box.reduced', [
    hl('div.title', i18n.site.analysis),
    hl('div.inner', [
      hl('div.action-menu__tools', [
        hl(
          'a',
          { hook: bind('click', ctrl.startSetup, ctrl.redraw), attrs: { 'data-icon': licon.Pencil } },
          i18n.site.goNewPosition,
        ),
        hl(
          'a',
          { hook: bind('click', ctrl.downloadSgf), attrs: { 'data-icon': licon.Download } },
          i18n.site.goDownloadSgf,
        ),
      ]),
      ctrl.mainline.length > 4 && [hl('h2', i18n.site.replayMode), autoplayButtons(ctrl)],
    ]),
  ]);
}
