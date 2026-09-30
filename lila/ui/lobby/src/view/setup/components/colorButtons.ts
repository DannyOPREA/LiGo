import { blindModeColorPicker, colorButtons as renderButtons } from 'lib/setup/view/color';
import { hl } from 'lib/view';

import type SetupController from '@/setupCtrl';

// Lobby games always get a random colour; a challenge lets the challenger pick.
export const colorButtons = ({ gameType, color }: SetupController) =>
  gameType === 'hook'
    ? undefined
    : site.blindMode
      ? hl('div', blindModeColorPicker(color))
      : renderButtons(color);
