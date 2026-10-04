import { blindModeColorPicker, colorButtons as renderButtons } from 'lib/setup/view/color';
import { hl } from 'lib/view';

import type SetupController from '@/setupCtrl';

// Lobby games always get a random colour; a challenge lets the challenger pick, except a rated handicap
// challenge, where the ranks decide (ADR 0021 §4, unit 5.7).
export const colorButtons = (setupCtrl: SetupController) => {
  const { gameType, color } = setupCtrl;
  if (gameType === 'hook') return undefined;
  const locked = setupCtrl.lockedColor();
  if (locked)
    return hl(
      'p.setup-locked-color',
      i18n.site.goYouPlayX(locked === 'black' ? i18n.site.black : i18n.site.white),
    );
  return site.blindMode ? hl('div', blindModeColorPicker(color)) : renderButtons(color);
};
