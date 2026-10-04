import { h } from 'snabbdom';

import { option } from 'lib/setup/option';
import type { MaybeVNode } from 'lib/view';

import type LobbyController from '@/ctrl';
import type { GameMode } from '@/interfaces';

import { gameModes } from '../../../options';

// Casual or rated for a signed-in player; a guest plays casual games and sees a sign-up link instead
// (ADR 0021 §5, unit 5.7). Below the choice, why the settings can't be rated, if they can't.
export const gameModeButtons = (ctrl: LobbyController): MaybeVNode => {
  if (!ctrl.me)
    return h(
      'div.config-group.setup-rated-signup',
      h('a', { attrs: { href: '/signup' } }, i18n.site.goSignUpToPlayRated),
    );
  const problem = ctrl.setupCtrl.ratedProblem();
  return h('div.setup-game-mode', [
    modeChoice(ctrl),
    // always there, so a screen reader announces a problem when it appears
    h('p.setup-rated-problem', { attrs: { role: 'status' } }, problem || ''),
  ]);
};

const modeChoice = ({ setupCtrl }: LobbyController): MaybeVNode =>
  site.blindMode
    ? h('div', [
        h('label', { attrs: { for: 'sf_mode' } }, i18n.site.mode),
        h(
          'select#sf_mode',
          {
            on: {
              change: (e: Event) => setupCtrl.gameMode((e.target as HTMLSelectElement).value as GameMode),
            },
          },
          gameModes.map(gm => option({ key: gm, name: i18n.site[gm] }, setupCtrl.gameMode())),
        ),
      ])
    : h('div.config-group', [
        h('div.label', i18n.site.gameMode),
        h(
          'group.radio',
          gameModes.map(gm => {
            const disabled = gm === 'rated' && setupCtrl.ratedModeDisabled();
            return h('div', [
              h(`input#sf_mode_${gm}.checked_${gm === setupCtrl.gameMode()}`, {
                attrs: {
                  name: i18n.site[gm],
                  type: 'radio',
                  value: gm,
                  checked: gm === setupCtrl.gameMode(),
                  disabled,
                  tabindex: disabled ? -1 : 0,
                },
                on: {
                  change: (e: Event) => setupCtrl.gameMode((e.target as HTMLInputElement).value as GameMode),
                },
              }),
              h('label', { class: { disabled }, attrs: { for: `sf_mode_${gm}` } }, i18n.site[gm]),
            ]);
          }),
        ),
      ]);
