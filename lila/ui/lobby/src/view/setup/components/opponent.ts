import { hl, type VNode } from 'lib/view';

import type SetupController from '../../../setupCtrl';

// Who the game is for (unit 6.8): anyone online, a link to send a friend, or the player whose profile or
// mini-profile the window came from. Real radio buttons like the size and mode pickers, so the arrow keys
// move between them. Switching keeps every other setting.
export const opponentChoice = (setupCtrl: SetupController): VNode => {
  const now = setupCtrl.opponent();
  const choice = (kind: 'anyone' | 'link' | 'named', label: string) =>
    hl('div', [
      hl(`input#sf_opponent_${kind}.setup-opponent--${kind}`, {
        attrs: { name: 'opponent', type: 'radio', value: kind },
        props: { checked: kind === now },
        on: { change: () => setupCtrl.setOpponent(kind) },
      }),
      hl('label', { attrs: { for: `sf_opponent_${kind}` } }, label),
    ]);
  return hl('div.config-group.setup-opponent', [
    hl('div.label', { attrs: { id: 'setup-opponent-label' } }, i18n.site.opponent),
    hl('group.radio', { attrs: { role: 'radiogroup', 'aria-labelledby': 'setup-opponent-label' } }, [
      choice('anyone', i18n.site.goOpponentAnyone),
      setupCtrl.namedUser ? choice('named', setupCtrl.namedUser) : null,
      choice('link', i18n.site.goOpponentLink),
    ]),
  ]);
};
