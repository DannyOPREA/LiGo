import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import {
  init as snabInit,
  attributesModule,
  classModule,
  eventListenersModule,
  propsModule,
  type VNode,
} from 'snabbdom';

import type LobbyController from '../src/ctrl';
import type { Hook, Seek } from '../src/interfaces';
import {
  applyChips,
  fit,
  rangeLabel,
  hookRow,
  liveSpeedOf,
  noChips,
  parseChips,
  playerRatingLabel,
  seekRow,
  sortRows,
  toggleRated,
  toggleSize,
  toggleSpeed,
  viewerOf,
  type OpenRow,
} from '../src/openChallenges';
import { migrateTab } from '../src/store';
import renderOpen, { visibleRows } from '../src/view/openChallenges';

// The shared test setup's i18n strings are functions; the site's are strings, which snabbdom renders as
// text, so this file uses plain strings (nbDays stays a function, as on the site).
(globalThis as any).i18n = {
  site: new Proxy(
    {},
    { get: (_, key: string) => (key === 'nbDays' ? (n: number) => `${n} days` : `site.${key}`) },
  ),
};

const patch = snabInit([classModule, attributesModule, propsModule, eventListenersModule]);

const mount = (vnodes: (VNode | string | null | undefined)[]): HTMLElement => {
  const root = document.createElement('div');
  const el = document.createElement('div');
  root.appendChild(el);
  patch(el, {
    sel: 'div',
    data: {},
    children: vnodes as VNode[],
    elm: undefined,
    text: undefined,
    key: undefined,
  });
  return root;
};

const go = { size: 13, rules: 'chinese', komi: 7.5 } as const;

const hook = (over: Partial<Hook> = {}): Hook =>
  ({
    id: 'h1',
    sri: 'other',
    clock: '5+3',
    t: 480,
    s: 2,
    i: 1,
    variant: 'standard',
    perf: 'go',
    rating: 1500,
    u: 'bob',
    action: 'join',
    go,
    ...over,
  }) as Hook;

const seek = (over: Partial<Seek> = {}): Seek =>
  ({
    id: 's1',
    username: 'bob',
    rating: 1500,
    mode: 0,
    days: 3,
    perf: { key: 'go' },
    action: 'joinSeek',
    go,
    ...over,
  }) as Seek;

// A stand-in lobby controller with only what the table reads.
const lobby = (over: Record<string, unknown> = {}) => {
  const ctrl = {
    me: { username: 'alice', isBot: false },
    data: { ratingMap: { go: 1500 }, seeks: [] as Seek[], hooks: [] as Hook[] },
    opts: { showRatings: true },
    stepHooks: [] as Hook[],
    hasOngoingRealTimeGame: () => false,
    stepping: false,
    mode: 'live',
    tab: 'open',
    chips: noChips(),
    redraw: () => {},
    setChips(chips: any) {
      ctrl.chips = chips;
      ctrl.redraw();
    },
    setMode(mode: string) {
      ctrl.mode = mode;
      ctrl.redraw();
    },
    ...over,
  } as any;
  ctrl.viewer = () => viewerOf(ctrl.me, ctrl.data.ratingMap);
  return ctrl as LobbyController;
};

const cellsOf = (el: HTMLElement) =>
  [...el.querySelectorAll('tbody tr')].map(tr => [...tr.querySelectorAll('td')].map(td => td.textContent));

beforeEach(() => localStorage.clear());

describe('the rows', () => {
  test('a hook becomes a row with its board, clock, rules and rating', () => {
    const row = hookRow(hook({ ra: 1, prov: true }));
    assert.deepEqual(
      [row.kind, row.user, row.rating, row.provisional, row.size, row.rules, row.komi, row.clock],
      ['live', 'bob', 1500, true, 13, 'chinese', 7.5, '5+3'],
    );
    assert.equal(row.rated, true);
    assert.equal(row.handicap, 0);
    assert.equal(row.own, false);
    assert.equal(hookRow(hook({ action: 'cancel' })).own, true);
  });

  test("a row shows the player's kyu/dan label the server made (unit 5.5)", () => {
    assert.equal(hookRow(hook({ goRank: '5k?' })).goRank, '5k?');
    assert.equal(seekRow(seek({ goRank: '1d' })).goRank, '1d');
    assert.equal(playerRatingLabel(1580, true, '5k?'), '5k?');
    // a server that sent no label: the rating, as before
    assert.equal(playerRatingLabel(1580, true), '1580?');
  });

  test('a seek becomes a row in days, and an unlimited one has none', () => {
    const row = seekRow(seek({ mode: 1 }));
    assert.deepEqual(
      [row.kind, row.days, row.rated, row.speed],
      ['correspondence', 3, true, 'correspondence'],
    );
    assert.equal(seekRow(seek({ days: undefined })).days, undefined);
  });

  test('handicap comes from the setup when it has one, and is even otherwise', () => {
    assert.equal(hookRow(hook({ go: { ...go, handicap: 4 } })).handicap, 4);
    assert.equal(hookRow(hook()).handicap, 0);
    assert.equal(seekRow(seek({ go: { ...go, handicap: 2 } })).handicap, 2);
  });

  test("a hook's speed comes from lila's speed id; ultra-bullet counts as bullet", () => {
    assert.deepEqual([0, 1, 2, 5, 3, 4].map(liveSpeedOf), [
      'bullet',
      'bullet',
      'blitz',
      'rapid',
      'classical',
      'classical',
    ]);
  });
});

describe('the filter chips', () => {
  const rows: OpenRow[] = [
    hookRow(hook({ id: 'a', go: { ...go, size: 9 }, s: 1 })),
    hookRow(hook({ id: 'b', go: { ...go, size: 19 }, s: 2, ra: 1 })),
    hookRow(hook({ id: 'c', go: { ...go, size: 19 }, s: 5 })),
    hookRow(hook({ id: 'd', go: undefined, s: 2 })),
    hookRow(hook({ id: 'mine', go: { ...go, size: 13 }, s: 3, action: 'cancel' })),
    seekRow(seek({ id: 'x', go: { ...go, size: 19 } })),
  ];
  const ids = (list: OpenRow[]) => list.map(r => r.id);

  test('no chip pressed shows everything', () => {
    assert.deepEqual(ids(applyChips(rows, noChips())), ['a', 'b', 'c', 'd', 'mine', 'x']);
  });

  test('board sizes add up as alternatives, and a game without a size is hidden by them', () => {
    const chips = toggleSize(toggleSize(noChips(), 9), 19);
    assert.deepEqual(ids(applyChips(rows, chips)), ['a', 'b', 'c', 'mine', 'x']);
  });

  test('speed chips filter live games only', () => {
    assert.deepEqual(ids(applyChips(rows, toggleSpeed(noChips(), 'blitz'))), ['b', 'd', 'mine', 'x']);
    assert.deepEqual(ids(applyChips(rows, toggleSpeed(toggleSpeed(noChips(), 'blitz'), 'rapid'))), [
      'b',
      'c',
      'd',
      'mine',
      'x',
    ]);
  });

  test('rated and casual', () => {
    assert.deepEqual(ids(applyChips(rows, toggleRated(noChips(), 'rated'))), ['b', 'mine']);
    assert.deepEqual(ids(applyChips(rows, toggleRated(noChips(), 'casual'))), ['a', 'c', 'd', 'mine', 'x']);
  });

  test('chips of different kinds all apply; your own challenge always stays', () => {
    const chips = toggleRated(toggleSize(noChips(), 19), 'casual');
    assert.deepEqual(ids(applyChips(rows, chips)), ['c', 'mine', 'x']);
  });

  test('pressing a pressed chip releases it', () => {
    assert.deepEqual(toggleSize(toggleSize(noChips(), 9), 9), noChips());
  });

  test('stored chips read back, and a stored value of another shape gives no chips', () => {
    const chips = toggleRated(toggleSpeed(toggleSize(noChips(), 13), 'rapid'), 'rated');
    assert.deepEqual(parseChips(JSON.stringify(chips)), chips);
    assert.deepEqual(parseChips(JSON.stringify({ sizes: [21, 9], speeds: ['chess'], rated: 'rated' })), {
      sizes: [9],
      speeds: [],
      rated: [],
    });
    for (const bad of [null, '', 'nope', '{"variant":["1"],"speed":["1","2"]}', '[]'])
      assert.deepEqual(parseChips(bad), noChips(), String(bad));
  });
});

describe('who can join, and the order', () => {
  const alice = { username: 'alice', rating: 1500 };

  test('you can join another signed-in player, not your own challenge, not across guests and members', () => {
    assert.deepEqual(fit(hookRow(hook()), alice), { joinable: true, suits: true });
    assert.deepEqual(fit(hookRow(hook({ action: 'cancel' })), alice), {
      joinable: false,
      reason: 'own',
      suits: false,
    });
    assert.equal(fit(hookRow(hook({ u: undefined, rating: undefined })), alice).reason, 'guests');
    assert.equal(fit(hookRow(hook()), { rating: 1500 }).reason, 'members');
    assert.equal(fit(hookRow(hook({ u: undefined, rating: undefined })), {}).joinable, true);
  });

  // unit 6.5: the server sends these rows too, with what decides them
  test('a guest cannot join a rated game, and says so before "members"', () => {
    assert.equal(fit(hookRow(hook({ ra: 1 })), {}).reason, 'rated');
  });

  test("a member's rating outside the range asked for greys the row; lila's limits are open", () => {
    const rr = { min: 1700, max: 1900, low: '2k', high: '1d' };
    assert.equal(fit(hookRow(hook({ rr })), alice).reason, 'range');
    assert.equal(fit(hookRow(hook({ rr })), { username: 'carol', rating: 1800 }).joinable, true);
    assert.equal(
      fit(hookRow(hook({ rr: { min: 400, max: 1400, high: '9k' } })), { username: 'low', rating: 300 })
        .joinable,
      true,
    );
    assert.equal(fit(hookRow(hook({ rr })), { username: 'new' }).joinable, true, 'no rating to check');
  });

  test('a provisional rating (sent with a minus sign) is checked by its value', () => {
    const viewer = viewerOf({ username: 'newbie' }, { go: -1800 });
    assert.equal(viewer.rating, 1800);
    const rr = { min: 1700, max: 1900, low: '2k', high: '1d' };
    assert.equal(fit(hookRow(hook({ rr })), viewer).joinable, true);
  });

  test('your own hook from another tab is yours, not one to join', () => {
    assert.equal(fit(hookRow(hook({ u: 'alice' })), alice).reason, 'own');
  });

  test('a range reads in ranks, open at either end', () => {
    assert.equal(rangeLabel({ min: 1700, max: 1900, low: '2k', high: '1d' }), '2k–1d');
    assert.equal(rangeLabel({ min: 1700, max: 2900, low: '2k' }), '2k+');
    assert.equal(rangeLabel({ min: 400, max: 1900, high: '1d' }), '≤ 1d');
    assert.equal(rangeLabel({ min: 400, max: 2900 }), '');
  });

  test("a hook's `auth` says who made it, even with no name shown", () => {
    assert.equal(fit(hookRow(hook({ u: undefined, rating: undefined, auth: true })), {}).reason, 'members');
  });

  test('the rows you cannot join come last', () => {
    const rr = { min: 1700, max: 1900, low: '2k', high: '1d' };
    const rows = [hookRow(hook({ id: 'far', rr })), hookRow(hook({ id: 'ok' }))];
    assert.deepEqual(
      sortRows(rows, alice).map(r => r.id),
      ['ok', 'far'],
    );
  });

  test('a row already taken cannot be joined', () => {
    assert.equal(fit(hookRow(hook({ disabled: true })), alice).joinable, false);
  });

  test('a row suits you when it is joinable and matches your chips', () => {
    const chips = toggleRated(noChips(), 'rated');
    assert.equal(fit(hookRow(hook()), alice, chips).suits, false);
    assert.equal(fit(hookRow(hook({ ra: 1 })), alice, chips).suits, true);
  });

  test('your own challenge first, then the closest rating', () => {
    const rows = [
      hookRow(hook({ id: 'far', rating: 2100 })),
      hookRow(hook({ id: 'near', rating: 1520 })),
      hookRow(hook({ id: 'below', rating: 1450 })),
      hookRow(hook({ id: 'mine', rating: 900, action: 'cancel' })),
    ];
    assert.deepEqual(
      sortRows(rows, alice).map(r => r.id),
      ['mine', 'near', 'below', 'far'],
    );
  });

  test('joinable rows come before rows you cannot join, however close their rating', () => {
    const rows = [
      hookRow(hook({ id: 'guest', u: undefined, rating: undefined })),
      hookRow(hook({ id: 'far', rating: 2400 })),
      hookRow(hook({ id: 'taken', rating: 1500, disabled: true })),
    ];
    assert.deepEqual(
      sortRows(rows, alice).map(r => r.id),
      ['far', 'taken', 'guest'],
    );
  });

  test('without a rating to compare, the shortest game comes first, and ties keep their order', () => {
    const rows = [
      hookRow(hook({ id: 'slow', t: 900 })),
      hookRow(hook({ id: 'fast', t: 60 })),
      hookRow(hook({ id: 'fast2', t: 60 })),
    ];
    assert.deepEqual(
      sortRows(rows, { username: 'alice' }).map(r => r.id),
      ['fast', 'fast2', 'slow'],
    );
  });
});

describe('the table', () => {
  test('a live game shows player and rating, board, time, rules and komi, even, and rated or casual', () => {
    const ctrl = lobby({
      stepHooks: [
        hook(),
        hook({ id: 'h2', ra: 1, clock: '10+0', go: { size: 9, rules: 'japanese', komi: 6.5 } }),
      ],
    });
    const el = mount(renderOpen(ctrl));
    assert.deepEqual(
      [...el.querySelectorAll('thead th')].map(th => th.textContent),
      ['site.player', 'site.board', 'site.time', 'site.goRules', 'site.goHandicap', 'site.mode'],
    );
    assert.deepEqual(cellsOf(el), [
      ['bob1500', '13×13', '5+3', 'site.goRulesChinese · 7.5', 'site.goEven', 'site.casual'],
      ['bob1500', '9×9', '10+0', 'site.goRulesJapanese · 6.5', 'site.goEven', 'site.rated'],
    ]);
    assert.match(el.querySelector('tbody tr')!.getAttribute('title')!, /13×13/);
    assert.equal(el.querySelector('tbody tr')!.getAttribute('data-kind'), 'live');
  });

  test('the handicap column shows the stones once a setup has them', () => {
    const ctrl = lobby({ stepHooks: [hook({ go: { ...go, handicap: 3 } })] });
    assert.equal(cellsOf(mount(renderOpen(ctrl)))[0][4], 'site.goHandicap 3');
  });

  test('a byo-yomi hook shows its clock string, and an increment of 0 breaks nothing', () => {
    const byo = hook({
      clock: '10+5×30s',
      t: 25 * 60,
      s: 3,
      i: 0,
      byo: { limit: 600, periods: 5, period: 30 },
    });
    const row = hookRow(byo);
    assert.equal(row.clock, '10+5×30s');
    assert.equal(row.speed, 'classical');
    const ctrl = lobby({ stepHooks: [byo] });
    assert.equal(cellsOf(mount(renderOpen(ctrl)))[0][2], '10+5×30s');
  });

  test('ratings are hidden when the site hides them', () => {
    const ctrl = lobby({ stepHooks: [hook()], opts: { showRatings: false } });
    assert.equal(cellsOf(mount(renderOpen(ctrl)))[0][0], 'bob');
  });

  test('the Correspondence chip shows seeks in days, with no speed chips', () => {
    const ctrl = lobby({
      mode: 'correspondence',
      data: { ratingMap: { go: 1500 }, seeks: [seek(), seek({ id: 's2', days: undefined, mode: 1 })] },
    });
    const el = mount(renderOpen(ctrl));
    assert.deepEqual(
      cellsOf(el).map(c => [c[2], c[5]]),
      [
        ['3 days', 'site.casual'],
        ['∞', 'site.rated'],
      ],
    );
    assert.equal(el.querySelector('tbody tr')!.getAttribute('data-kind'), 'correspondence');
    assert.equal(el.querySelectorAll('.open__chips [aria-label="site.time"]').length, 0);
    assert.equal(
      mount(renderOpen(lobby())).querySelectorAll('.open__chips [aria-label="site.time"] .chip').length,
      4,
    );
  });

  test('the Live / Correspondence chip shows the current kind and switches it', () => {
    const ctrl = lobby({ stepHooks: [hook()] });
    const el = mount(renderOpen(ctrl));
    const chips = [...el.querySelectorAll<HTMLButtonElement>('.open__mode .chip')];
    assert.deepEqual(
      chips.map(c => [c.textContent, c.getAttribute('aria-pressed')]),
      [
        ['site.live', 'true'],
        ['site.correspondence', 'false'],
      ],
    );
    chips[1].click();
    assert.equal(ctrl.mode, 'correspondence');
    assert.equal(
      mount(renderOpen(ctrl)).querySelector('.open__mode .chip.active')!.textContent,
      'site.correspondence',
    );
  });

  test('pressing a chip filters the rows; reset brings them back', () => {
    const ctrl = lobby({ stepHooks: [hook({ id: 'a' }), hook({ id: 'b', go: { ...go, size: 9 } })] });
    assert.equal(visibleRows(ctrl).length, 2);
    const press = (label: string) =>
      [...mount(renderOpen(ctrl)).querySelectorAll<HTMLButtonElement>('.chip')]
        .find(c => c.textContent === label)!
        .click();
    press('9×9');
    assert.deepEqual(
      visibleRows(ctrl).map(r => r.id),
      ['b'],
    );
    assert.ok(mount(renderOpen(ctrl)).querySelector('.chip.reset'));
    press('site.reset');
    assert.equal(visibleRows(ctrl).length, 2);
    assert.equal(mount(renderOpen(ctrl)).querySelector('.chip.reset'), null);
  });

  test('rows come sorted for the viewer, and a message shows when none match', () => {
    const ctrl = lobby({
      stepHooks: [hook({ id: 'far', rating: 2000 }), hook({ id: 'near', rating: 1510 })],
    });
    assert.deepEqual(
      visibleRows(ctrl).map(r => r.id),
      ['near', 'far'],
    );
    ctrl.stepHooks = [];
    assert.ok(mount(renderOpen(ctrl)).querySelector('.open__empty'));
  });
});

describe('the remembered tab', () => {
  test("lila's two old tabs both open Open challenges, on the same kind of game", () => {
    assert.deepEqual(migrateTab('real_time'), { tab: 'open', mode: 'live' });
    assert.deepEqual(migrateTab('seeks'), { tab: 'open', mode: 'correspondence' });
    assert.equal(migrateTab('pools'), undefined);
    assert.equal(migrateTab(null), undefined);
  });
});

describe('taps and names (review of unit 6.7 part one)', () => {
  test('a tap anywhere in a row joins it, a card padding included', () => {
    const clicked: string[] = [];
    const ctrl = lobby({ stepHooks: [hook()], clickHook: (id: string) => clicked.push(id) });
    const el = mount(renderOpen(ctrl));
    const row = el.querySelector<HTMLElement>('tbody tr')!;
    row.dispatchEvent(new (el.ownerDocument.defaultView as any).MouseEvent('click', { bubbles: true }));
    row
      .querySelector('td.time')!
      .dispatchEvent(new (el.ownerDocument.defaultView as any).MouseEvent('click', { bubbles: true }));
    assert.deepEqual(clicked, ['h1', 'h1']);
  });

  test('a tap outside the rows does nothing', () => {
    const clicked: string[] = [];
    const ctrl = lobby({ stepHooks: [hook()], clickHook: (id: string) => clicked.push(id) });
    const el = mount(renderOpen(ctrl));
    el.querySelector('thead')!.dispatchEvent(
      new (el.ownerDocument.defaultView as any).MouseEvent('click', { bubbles: true }),
    );
    assert.deepEqual(clicked, []);
  });

  test("a guest sees a correspondence seek's player, as in lila, but not a live hook's", () => {
    const guest = lobby({
      me: undefined,
      mode: 'correspondence',
      data: { ratingMap: undefined, seeks: [seek()], hooks: [] },
    });
    assert.equal(cellsOf(mount(renderOpen(guest)))[0][0], 'bob1500');
    const live = lobby({ me: undefined, stepHooks: [hook()] });
    assert.equal(cellsOf(mount(renderOpen(live)))[0][0], 'site.anonymous1500');
  });

  test('a stored old tab opens the new tab on the same kind of game, once', async () => {
    const { make } = await import('../src/store');
    localStorage.setItem('lobby.tab:alice', 'seeks');
    const stores = make('alice');
    assert.equal(stores.tab.get(), 'open');
    assert.equal(stores.mode.get(), 'correspondence');
  });
});

describe('the Create a game button (unit 6.8)', () => {
  const opened: unknown[][] = [];
  const withSetup = (over: Record<string, unknown> = {}) =>
    lobby({
      opts: { showRatings: true, playban: false },
      setupCtrl: { openModal: (...args: unknown[]) => opened.push(args) },
      ...over,
    });
  const create = (ctrl: LobbyController) =>
    mount(renderOpen(ctrl)).querySelector<HTMLElement>('.create .button');
  beforeEach(() => (opened.length = 0));

  test('opens the one custom-game window on a real-time clock in the live list, for a guest too', () => {
    for (const me of [{ username: 'alice', isBot: false }, undefined]) {
      opened.length = 0;
      const ctrl = withSetup({ me });
      create(ctrl)!.click();
      assert.deepEqual(opened, [['hook', undefined, undefined, { timeMode: 'realTime' }]]);
    }
  });

  test('opens it on a correspondence clock in the correspondence list, for a member only', () => {
    const ctrl = withSetup({ mode: 'correspondence' });
    create(ctrl)!.click();
    assert.deepEqual(opened, [['hook', undefined, undefined, { timeMode: 'correspondence' }]]);
    assert.equal(create(withSetup({ mode: 'correspondence', me: undefined })), null);
  });

  test('is not offered to a player who can’t start a live game', () => {
    assert.equal(create(withSetup({ me: { username: 'bot', isBot: true } })), null);
    assert.equal(create(withSetup({ opts: { showRatings: true, playban: true } })), null);
    assert.equal(create(withSetup({ hasOngoingRealTimeGame: () => true })), null);
  });
});
