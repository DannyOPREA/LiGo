import { licon } from 'lib/licon';
import { storage } from 'lib/storage';
import { type LooseVNodes, type VNode, bind, bindNonPassive, hl, onInsert } from 'lib/view';
import stepwiseScroll from 'lib/view/stepwiseScroll';

import type AnalyseCtrl from '@/ctrl';
import { settingsText } from '@/go';

import { view as actionMenu } from './actionMenu';
import { renderControls } from './controls';
import { renderSetup } from './setup';
import { renderSgf } from './sgf';

export default function view(ctrl: AnalyseCtrl): VNode {
  return hl('main.analyse.analyse--go', { class: { 'analyse--setup': !!ctrl.setup } }, [
    renderBoard(ctrl),
    ctrl.setup ? renderSetup(ctrl, ctrl.setup) : renderTools(ctrl),
    !ctrl.setup && renderControls(ctrl),
    hl('div.analyse__underboard', [!ctrl.setup && renderSgf(ctrl)]),
    hl('aside.analyse__side', renderSide(ctrl)),
  ]);
}

function renderBoard(ctrl: AnalyseCtrl): VNode {
  const scroll =
    ctrl.setup || 'ontouchstart' in window || !storage.boolean('scrollMoves').getOrDefault(true)
      ? undefined
      : bindNonPassive(
          'wheel',
          stepwiseScroll(
            e => {
              if (e.deltaY > 0) ctrl.navigate.next();
              else if (e.deltaY < 0) ctrl.navigate.prev();
              ctrl.redraw();
            },
            () => false,
          ),
        );
  return hl('div.analyse__board.main-board', { hook: scroll }, [
    ctrl.board.loadFailed
      ? hl('div.analyse__go-board-failed', i18n.site.goBoardFailedToLoad)
      : hl('div.analyse__go-board', {
          // A fresh element for setup mode and back, so snabbdom mounts the right one.
          key: ctrl.setup ? 'editor' : 'board',
          hook: {
            insert: vnode => ctrl.board.attach(vnode.elm as HTMLElement),
            destroy: vnode => ctrl.board.detach(vnode.elm as HTMLElement),
          },
        }),
  ]);
}

/** Who plays next and the prisoners so far, at the position shown. */
function renderStatus(ctrl: AnalyseCtrl): VNode {
  const n = ctrl.node;
  const stone = (color: 'black' | 'white') =>
    hl(`span.go-prisoners__stone.${color}`, { attrs: { 'aria-hidden': 'true' } });
  return hl('div.analyse__go-status', [
    hl('div.analyse__go-turn', [
      stone(n.toMove),
      n.toMove === 'black' ? i18n.site.blackPlays : i18n.site.whitePlays,
    ]),
    hl('div.go-prisoners', [
      i18n.site.goPrisonersLabel,
      stone('black'),
      hl('span', { attrs: { title: i18n.site.goStonesBlackHasTaken } }, String(n.captures.black)),
      stone('white'),
      hl('span', { attrs: { title: i18n.site.goStonesWhiteHasTaken } }, String(n.captures.white)),
    ]),
  ]);
}

function renderTools(ctrl: AnalyseCtrl): VNode {
  return hl('div.analyse__tools', [
    renderStatus(ctrl),
    // focusable, so the move list scrolls from the keyboard too (axe's scrollable-region-focusable, unit 9.10)
    hl('div.analyse__moves.areplay', { attrs: { tabindex: 0 }, hook: ctrl.treeView.hook() }, [
      hl('div', ctrl.treeView.render()),
    ]),
    renderEngine(ctrl),
    hl('div.analyse__go-actions', [
      hl(
        'button.button.button-empty.text',
        {
          attrs: { 'data-icon': licon.Forward, title: i18n.site.goPassTitle },
          hook: bind('click', ctrl.pass),
        },
        i18n.site.goPass,
      ),
      ctrl.notice && hl('p.analyse__go-notice', { attrs: { role: 'status' } }, ctrl.notice),
    ]),
    ctrl.actionMenu() && actionMenu(ctrl),
  ]);
}

/**
 * Where an engine review will show (PLAN §1.3: a later KataGo review). lila's chess engine went in
 * unit 3.5; this is the one place the view calls, so the review has somewhere to plug in (ADR 0023 §1).
 */
const renderEngine = (_ctrl: AnalyseCtrl): VNode | undefined => undefined;

/** The game the tree is played under, and what its file says about the game. */
function renderSide(ctrl: AnalyseCtrl): LooseVNodes {
  const s = ctrl.root.settings;
  const info = ctrl.root.sgf;
  const one = (key: string) => info[key]?.[0]?.trim();
  const player = (name?: string, rank?: string) => (name ? (rank ? `${name} (${rank})` : name) : undefined);
  const black = player(one('PB'), one('BR'));
  const white = player(one('PW'), one('WR'));
  return [
    hl('div.analyse__go-settings', [
      hl('strong', settingsText(s)),
      s.rulesetUnknown && hl('p', i18n.site.goRulesUnknown),
      (black || white) &&
        hl('p.analyse__go-players', [
          hl('span', i18n.site.goBlackX(black ?? '?')),
          hl('span', i18n.site.goWhiteX(white ?? '?')),
        ]),
      one('RE') && hl('p', i18n.site.goResultX(one('RE'))),
    ]),
    // a stored game's own page and SGF (unit 7.5), beside the tree's download in the SGF box
    ctrl.opts.game &&
      hl('div.analyse__go-game', [
        hl(
          'a.text',
          { attrs: { href: ctrl.opts.game.url, 'data-icon': licon.Back } },
          i18n.site.goBackToTheGame,
        ),
        hl(
          'a.text',
          { attrs: { href: ctrl.opts.game.sgfUrl, download: '', 'data-icon': licon.Download } },
          i18n.site.goDownloadGameSgf,
        ),
      ]),
    !ctrl.setup &&
      hl(
        'button.button.button-empty.text',
        {
          attrs: { 'data-icon': licon.Pencil },
          hook: onInsert(el => el.addEventListener('click', ctrl.startSetup)),
        },
        i18n.site.goNewPosition,
      ),
  ];
}
