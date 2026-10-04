import { timePickerAndSliders } from 'lib/setup/view/timeControl';
import { hl, type VNode, type LooseVNodes, snabDialog, spinnerVdom } from 'lib/view';

import type LobbyController from '@/ctrl';

import { colorButtons } from './components/colorButtons';
import { gameModeButtons } from './components/gameModeButtons';
import { goAdvancedFields, goSizePicker } from './components/goOptions';
import { opponentChoice } from './components/opponent';
import { presetRow } from './components/presets';
import { ratingDifferenceSliders } from './components/ratingDifferenceSliders';
import { ratingView } from './components/ratingView';

export default function setupModal(ctrl: LobbyController): VNode[] | null {
  const { setupCtrl } = ctrl;
  if (!setupCtrl.gameType) return null;
  const opponent = setupCtrl.opponent();
  // one title and one button text per opponent
  const title = {
    anyone: i18n.site.createAGame,
    link: i18n.site.challengeAFriend,
    named: i18n.site.challengeX(setupCtrl.friendUser),
  }[opponent];
  const buttonText = {
    anyone: i18n.site.createLobbyGame,
    link: i18n.site.goCreateChallengeLink,
    named: i18n.site.goSendChallenge,
  }[opponent];
  const disabled = !setupCtrl.valid() || setupCtrl.loading;
  return [
    snabDialog({
      attrs: { dialog: { 'aria-labelledBy': 'lobby-setup-modal-title', 'aria-modal': 'true' } },
      class: 'game-setup',
      css: [{ hashed: 'lobby.setup' }],
      onClose: () => {
        setupCtrl.closeModal = undefined;
        setupCtrl.gameType = null;
        setupCtrl.root.redraw();
      },
      modal: true,
      easyClose: 'clickOutside',
      vnodes: [
        hl('h2#lobby-setup-modal-title', title),
        hl('div.setup-content', content(ctrl)),
        hl('div.footer', [
          hl(
            `button.button.button-metal.lobby__start__button.lobby__start__button--${opponent === 'named' ? 'friend-user' : setupCtrl.gameType}`,
            {
              attrs: { disabled },
              class: { disabled },
              on: { click: setupCtrl.submit },
            },
            buttonText,
          ),
          setupCtrl.loading && spinnerVdom(),
        ]),
      ],
      onInsert: dlg => {
        setupCtrl.closeModal = dlg.close;
        dlg.show();
      },
    }),
  ].filter(v => v !== null);
}

// One list for every opponent (unit 6.8): the board, clock and mode stay in view; ruleset, komi, stones
// and the rank range fold away under a one-line digest of what they hold.
const content = (ctrl: LobbyController): LooseVNodes => {
  const { setupCtrl } = ctrl;
  return [
    opponentChoice(setupCtrl),
    presetRow(setupCtrl),
    goSizePicker(setupCtrl),
    timePickerAndSliders(setupCtrl.timeControl, 0),
    gameModeButtons(ctrl),
    colorButtons(setupCtrl),
    hl(
      'details.setup-advanced',
      {
        props: { open: setupCtrl.advancedOpen() },
        on: {
          toggle: (e: Event) => {
            const open = (e.target as HTMLDetailsElement).open;
            if (open !== setupCtrl.advancedOpen()) setupCtrl.advancedChoice = open;
          },
        },
      },
      [
        hl('summary', [
          hl('span.setup-advanced__title', i18n.site.advancedSettings),
          hl('span.setup-advanced__digest', setupCtrl.advancedDigest()),
        ]),
        hl('div.setup-advanced__body', [
          goAdvancedFields(setupCtrl),
          // an open game is for ranks near yours; a challenge names its opponent
          setupCtrl.opponent() === 'anyone' ? ratingView(ctrl) : null,
          setupCtrl.opponent() === 'anyone' ? ratingDifferenceSliders(ctrl) : null,
        ]),
      ],
    ),
  ];
};
