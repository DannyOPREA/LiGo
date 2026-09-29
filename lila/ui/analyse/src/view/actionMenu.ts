import { isEmpty } from 'lib';
import { cont as contRoute } from 'lib/game/router';
import { licon } from 'lib/licon';
import { domDialog, bind, dataIcon, hl, type VNode } from 'lib/view';

import type { AutoplayDelay } from '@/autoplay';
import type AnalyseCtrl from '@/ctrl';

import { showSettingsDialog } from './settingsView';

interface AutoplaySpeed {
  name: keyof I18n['site'];
  delay: AutoplayDelay;
}

const baseSpeeds: AutoplaySpeed[] = [
  { name: 'fast', delay: 1000 },
  { name: 'slow', delay: 5000 },
];

const realtimeSpeed: AutoplaySpeed = {
  name: 'realtimeReplay',
  delay: 'realtime',
};

const cplSpeed: AutoplaySpeed = {
  name: 'byCPL',
  delay: 'cpl',
};

function autoplayButtons(ctrl: AnalyseCtrl): VNode {
  const d = ctrl.data;
  const speeds = [
    ...baseSpeeds,
    ...(d.game.speed !== 'correspondence' && !isEmpty(d.game.moveCentis) ? [realtimeSpeed] : []),
    ...(d.analysis ? [cplSpeed] : []),
  ];
  return hl(
    'div.autoplay',
    speeds.map(speed => {
      const active = ctrl.autoplay.getDelay() === speed.delay;
      return hl(
        'a.button',
        {
          class: { active, 'button-empty': !active },
          hook: bind('click', () => ctrl.togglePlay(speed.delay), ctrl.redraw),
        },
        String(i18n.site[speed.name]),
      );
    }),
  );
}

export function view(ctrl: AnalyseCtrl): VNode {
  const d = ctrl.data,
    canContinue = !ctrl.ongoing && d.game.variant.key === 'standard',
    linkAttrs = { rel: ctrl.isEmbed ? '' : 'nofollow', target: ctrl.isEmbed ? '_blank' : '' };

  const tools = [
    hl('div.action-menu__tools', [
      hl(
        'a',
        {
          hook: bind('click', () => {
            ctrl.flip();
            ctrl.actionMenu.toggle();
            ctrl.redraw();
          }),
          attrs: { 'data-icon': licon.ChasingArrows, title: 'Hotkey: f' },
        },
        i18n.site.flipBoard,
      ),
      !ctrl.ongoing &&
        hl(
          'a',
          {
            attrs: {
              'data-icon': licon.Pencil,
              href: ctrl.boardEditorUrl(),
              title: 'Hotkey: b',
              ...linkAttrs,
            },
          },
          i18n.site.boardEditor,
        ),
      canContinue &&
        hl(
          'a',
          {
            hook: bind('click', () =>
              domDialog({
                cash: $('.continue-with.g_' + d.game.id),
                modal: true,
                show: true,
                easyClose: 'clickOutside',
              }),
            ),
            attrs: dataIcon(licon.Swords),
          },
          i18n.site.continueFromHere,
        ),
      ctrl.idbTree.movesDirty &&
        hl(
          'a',
          {
            attrs: {
              'data-icon': licon.Trash,
              title: i18n.site.clearLocalData,
            },
            hook: bind('click', () => ctrl.idbTree.clear()),
          },
          i18n.site.clearLocalData,
        ),
      hl(
        'button',
        {
          attrs: { 'data-icon': licon.Gear, title: i18n.site.settings },
          on: { click: () => showSettingsDialog(ctrl) },
        },
        i18n.site.settings,
      ),
    ]),
  ];

  return hl('div.action-menu.sub-box.reduced', [
    hl('div.title', i18n.site.analysis),
    hl('div.inner', [
      tools,
      ctrl.mainline.length > 4 && [hl('h2', i18n.site.replayMode), autoplayButtons(ctrl)],
      canContinue &&
        hl('div.continue-with.none.g_' + d.game.id, [
          hl(
            'a.button',
            {
              attrs: {
                href: d.userAnalysis
                  ? '/?fen=' + ctrl.encodeNodeFen() + '#friend'
                  : contRoute(d, 'friend') + '?fen=' + ctrl.node.fen,
                ...linkAttrs,
              },
            },
            i18n.site.challengeAFriend,
          ),
        ]),
    ]),
  ]);
}
