import type { Attrs } from 'snabbdom';

import { hl, onInsert, spinnerVdom, type VNode } from 'lib/view';

import type LobbyController from '../ctrl';
import type { Pool } from '../interfaces';
import { columns, effectiveChips, elapsed, rangeText, tileCount, type CorresTile } from '../quickPair';

// The quick-pairing view (unit 6.6, ADR 0022 §1, §2, §4): the chip row, then the tiles in three columns
// (9×9, 19×19, correspondence), then the custom game button. One click on a tile starts waiting there; the
// waiting tile shows the count, the ranks you can meet, the time since the click and Cancel.

const createHandler = (ctrl: LobbyController) => (e: Event) => {
  if (ctrl.redirecting) return;
  const target = (e.target as HTMLElement).closest<HTMLElement>('[data-id]');
  if (!target) return; // the chips handle their own clicks
  if (e instanceof KeyboardEvent) {
    // a real button (Cancel) gets its click from the browser
    if ((e.key !== 'Enter' && e.key !== ' ') || e.repeat || target.tagName === 'BUTTON') return;
    e.preventDefault(); // Prevent page scroll on space
  }
  const id = target.dataset['id']!;
  if (target.dataset['kind'] === 'cancel') ctrl.stopWaiting();
  else if (id === 'custom')
    // the lobby's Rated / Casual chip counts only until the player has settings of their own
    ctrl.setupCtrl.openModal('hook', undefined, undefined, {
      gameMode: effectiveChips(ctrl.quickChips, !!ctrl.me).rated ? 'rated' : 'casual',
    });
  else if (target.dataset['kind'] === 'corres') ctrl.clickCorres(id);
  else ctrl.clickPool(id);
  ctrl.redraw();
};

export const hooks = (ctrl: LobbyController) =>
  onInsert(el => {
    const handler = createHandler(ctrl);
    el.addEventListener('click', handler);
    el.addEventListener('keydown', handler);
  });

export function render(ctrl: LobbyController): VNode[] {
  return [
    chipRow(ctrl),
    hl(
      'div.lpools__grid',
      columns(ctrl.pools, ctrl.corres).map(col =>
        hl(`div.lpools__col.lpools__col--${col.key}`, { attrs: { role: 'group', 'aria-label': col.title } }, [
          hl('h3.lpools__title', col.title),
          ...col.pools.map(pool => poolTile(ctrl, pool)),
          ...col.corres.map(tile => corresTile(ctrl, tile)),
        ]),
      ),
    ),
    hl(
      'div.lpool.lpool--custom',
      {
        class: { transp: !!ctrl.waiting },
        attrs: { role: 'button', tabindex: '0', 'data-id': 'custom' },
      },
      i18n.site.custom,
    ),
  ];
}

// Rated / Casual and Handicap OK / Even only (ADR 0022 §2). A guest sees the sign-up line in place of
// Rated; with Casual the handicap chip is off, with its reason.
function chipRow(ctrl: LobbyController): VNode {
  const signedIn = !!ctrl.me;
  const chips = effectiveChips(ctrl.quickChips, signedIn);
  const chip = (label: string, pressed: boolean, disabled: boolean, onClick: () => void, title?: string) =>
    hl(
      'button.lpools__chip',
      {
        class: { active: pressed },
        attrs: {
          type: 'button',
          'aria-pressed': pressed ? 'true' : 'false',
          disabled,
          title: title ?? '',
        },
        on: { click: onClick },
      },
      label,
    );
  const set = (rated: boolean, handicap: boolean) => () => ctrl.setQuickChips({ rated, handicap });
  const { rated: storedRated, handicap: storedHandicap } = ctrl.quickChips;
  return hl('div.lpools__chips', [
    signedIn
      ? hl('div.lpools__chip-group', { attrs: { role: 'group' } }, [
          chip(i18n.site.rated, chips.rated, false, set(true, storedHandicap)),
          chip(i18n.site.casual, !chips.rated, false, set(false, storedHandicap)),
        ])
      : hl('a.lpools__signup', { attrs: { href: '/signup' } }, i18n.site.goSignUpForRated),
    hl('div.lpools__chip-group', { attrs: { role: 'group' } }, [
      chip(
        i18n.site.goHandicapOk,
        chips.handicap,
        !chips.rated,
        set(storedRated, true),
        chips.rated ? undefined : i18n.site.goCasualQuickGamesEven,
      ),
      chip(
        i18n.site.goEvenOnly,
        !chips.handicap,
        !chips.rated,
        set(storedRated, false),
        chips.rated ? undefined : i18n.site.goCasualQuickGamesEven,
      ),
    ]),
    !chips.rated && hl('span.lpools__hint', i18n.site.goCasualQuickGamesEven),
  ]);
}

// A tile reads out its own text (clock, speed, count) inside its column's group. The tile you wait on is
// no button: its Cancel is, and a button can't hold another one.
const tileAttrs = (id: string, kind: 'pool' | 'corres', active: boolean): Attrs =>
  active
    ? { 'data-id': id, 'data-kind': kind }
    : { role: 'button', tabindex: '0', 'data-id': id, 'data-kind': kind };

function poolTile(ctrl: LobbyController, pool: Pool): VNode {
  const active = ctrl.waiting?.id === pool.id;
  const rated = effectiveChips(ctrl.quickChips, !!ctrl.me).rated;
  const count = tileCount(pool, rated, ctrl.poolSizes, ctrl.data.hooks, ctrl.viewer());
  return hl(
    'div.lpool',
    { class: { active, transp: !!ctrl.waiting && !active }, attrs: tileAttrs(pool.id, 'pool', active) },
    [
      hl('div.clock', pool.clock),
      active ? waitingBody(ctrl) : hl('div.perf', i18n.site[pool.speed]),
      hl('div.lpool__count', { class: { empty: !count } }, i18n.site.goNbWaiting(count)),
    ],
  );
}

function corresTile(ctrl: LobbyController, tile: CorresTile): VNode {
  const active = ctrl.waiting?.id === tile.id;
  const days = tile.days === 1 ? i18n.site.oneDay : i18n.site.nbDays(tile.days);
  return hl(
    'div.lpool.lpool--corres',
    {
      class: { active, transp: !!ctrl.waiting && !active },
      attrs: tileAttrs(tile.id, 'corres', active),
    },
    [hl('div.clock', days), active ? waitingBody(ctrl) : hl('div.perf', `${tile.go.size}×${tile.go.size}`)],
  );
}

// The tile you wait on: the ranks you can meet (a rated pool, once the server has sent them), the time
// since your click, and Cancel.
function waitingBody(ctrl: LobbyController): VNode {
  const w = ctrl.waiting!;
  const range = w.kind === 'pool' ? ctrl.poolRange : undefined;
  return hl('div.lpool__waiting', [
    range
      ? hl('div.range', { attrs: { title: i18n.site.goWaitingRangeHint } }, [
          i18n.site.goCanMeetX(rangeText(range)),
          range.stones > 0 && hl('div.lpool__stones', i18n.site.goOrUpToNbStones(range.stones)),
        ])
      : spinnerVdom(),
    hl('div.lpool__elapsed', elapsed(Date.now() - w.since)),
    hl(
      'button.button.button-empty.lpool__cancel',
      { attrs: { type: 'button', 'data-id': w.id, 'data-kind': 'cancel' } },
      i18n.site.cancel,
    ),
  ]);
}
