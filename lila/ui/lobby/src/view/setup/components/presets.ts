import { hl, type VNode } from 'lib/view';

import type SetupController from '../../../setupCtrl';

// A row of starting points at the top of the window (unit 6.8): the settings as they were last time, then
// ADR 0005's tiles. A preset fills the board and the clock; everything else stays.
export const presetRow = (setupCtrl: SetupController): VNode => {
  const active = setupCtrl.activePreset();
  const chip = (label: string, detail: string | undefined, pressed: boolean, onClick: () => void) =>
    hl(
      'button.setup-preset',
      {
        class: { active: pressed },
        attrs: { type: 'button', 'aria-pressed': pressed ? 'true' : 'false' },
        on: { click: onClick },
      },
      [hl('strong', label), detail ? hl('small', detail) : null],
    );
  return hl('div.setup-presets', { attrs: { role: 'group', 'aria-label': i18n.site.goPresets } }, [
    chip(i18n.site.goLastSettings, undefined, !active && setupCtrl.lastActive(), setupCtrl.restoreLast),
    ...setupCtrl
      .presets()
      .map(p => chip(p.label, p.detail, p === active || p.id === active?.id, () => setupCtrl.applyPreset(p))),
  ]);
};
