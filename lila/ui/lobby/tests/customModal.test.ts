// The custom-game window (unit 6.8): one window for an open game and a challenge, an opponent choice that
// keeps the settings, presets from the server's pools, one remembered store, a folded advanced section and
// a named opponent's suggested stones.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
import { customPresets, presetMatches } from '../src/customSetup';
import SetupController, { type HandicapAdvice } from '../src/setupCtrl';
import { opponentChoice } from '../src/view/setup/components/opponent';
import { presetRow } from '../src/view/setup/components/presets';

const formats = new Set(['goRatedStonesXToY', 'goSuggestedHandicapX', 'goYouPlayX', 'goRankRangeXToY']);
(globalThis as any).i18n = {
  site: new Proxy(
    {},
    {
      get: (_, key: string) =>
        key === 'goNbHandicapStones'
          ? (n: number) => `${n} stones`
          : key === 'nbDays'
            ? (n: number) => `${n} days`
            : key === 'challengeX'
              ? (u: string) => `Challenge ${u}`
              : formats.has(key)
                ? (...args: unknown[]) => `site.${key}(${args.join(',')})`
                : `site.${key}`,
    },
  ),
};

const patch = snabInit([classModule, attributesModule, propsModule, eventListenersModule]);
const mount = (vnode: VNode): HTMLElement => {
  const root = document.createElement('div');
  const el = document.createElement('div');
  root.appendChild(el);
  patch(el, vnode);
  return root;
};

const pools = [
  {
    id: '9x9-3m-3x20s',
    size: 9,
    clock: '3+3×20s',
    speed: 'blitz',
    byo: { limit: 180, periods: 3, period: 20 },
  },
  {
    id: '19x19-10m-5x30s',
    size: 19,
    clock: '10+5×30s',
    speed: 'rapid',
    byo: { limit: 600, periods: 5, period: 30 },
  },
  { id: '9x9-3m-2s', size: 9, clock: '3+2', speed: 'blitz', lim: 3, inc: 2 },
  { id: '19x19-10m-10s', size: 19, clock: '10+10', speed: 'rapid', lim: 10, inc: 10 },
];
const corres = [
  { id: '19x19-3d', days: 3, go: { size: 19, rules: 'japanese', komi: 6.5 } },
  { id: '19x19-1d', days: 1, go: { size: 19, rules: 'japanese', komi: 6.5 } },
];

// GoRating.rankTable, as the lobby page data carries it (unit 5.7)
const rankTable: [string, number][] = JSON.parse(
  readFileSync(new URL('../../playground/e2e/rank-table.json', import.meta.url), 'utf8'),
);

const lobby = (signedIn = true, rated = false) => {
  const ctrl = {
    me: signedIn ? { username: 'alice', isBot: false } : undefined,
    data: { ratingMap: signedIn ? { go: 1580 } : null, seeks: [], rankTable },
    opts: { showRatings: true },
    pools,
    corres,
    redraw: () => {},
    leavePool: () => {},
  } as unknown as LobbyController;
  const setup = new SetupController(ctrl);
  (ctrl as any).setupCtrl = setup;
  void rated;
  return { ctrl, setup };
};

const formOf = (setup: SetupController) => Object.fromEntries(setup.propsToFormData('random').entries());
const key = (name: string) => `lobby.setup.alice.${name}`;

beforeEach(() => localStorage.clear());

describe('the opponent choice', () => {
  test('Anyone is an open game, the link a challenge with no player, a named player a challenge to them', () => {
    const { setup } = lobby();
    setup.openModal('friend', undefined, 'Shiro');
    assert.equal(setup.opponent(), 'named');
    setup.setOpponent('link');
    assert.deepEqual([setup.opponent(), setup.gameType, setup.friendUser], ['link', 'friend', '']);
    setup.setOpponent('anyone');
    assert.deepEqual([setup.opponent(), setup.gameType], ['anyone', 'hook']);
    setup.setOpponent('named');
    assert.deepEqual([setup.opponent(), setup.friendUser], ['named', 'Shiro']);
  });

  test('the named choice only exists when a player was named', () => {
    const { setup } = lobby();
    setup.openModal('hook');
    setup.setOpponent('named');
    assert.equal(setup.opponent(), 'anyone');
    assert.equal(mount(opponentChoice(setup)).querySelector('.setup-opponent--named'), null);
    setup.openModal('friend', undefined, 'Shiro');
    const el = mount(opponentChoice(setup));
    const radios = [...el.querySelectorAll<HTMLInputElement>('input[type=radio][name=opponent]')];
    assert.deepEqual(
      radios.map(r => [el.querySelector(`label[for=${r.id}]`)!.textContent, r.checked]),
      [
        ['site.goOpponentAnyone', false],
        ['Shiro', true],
        ['site.goOpponentLink', false],
      ],
    );
    radios[2].dispatchEvent(new window.Event('change'));
    assert.equal(setup.opponent(), 'link');
  });

  test('switching keeps the size, clock, ruleset and komi', () => {
    const { setup } = lobby();
    setup.openModal('hook');
    setup.setGoSize(9);
    setup.setGoRuleset('chinese');
    setup.setGoKomi('5.5');
    setup.timeControl.mode('byoyomi');
    setup.timeControl.periodsV(3);
    setup.setOpponent('link');
    assert.deepEqual(
      [
        setup.goSize(),
        setup.goRuleset(),
        setup.goKomi(),
        setup.timeControl.mode(),
        setup.timeControl.periods(),
      ],
      [9, 'chinese', 5.5, 'byoyomi', 3],
    );
    setup.setOpponent('anyone');
    assert.deepEqual([setup.goSize(), setup.goRuleset(), setup.goKomi()], [9, 'chinese', 5.5]);
  });

  test('an open game is even: the stones are held, not sent, and come back with the challenge', () => {
    const { setup } = lobby();
    setup.openModal('friend');
    setup.setHandicap(3);
    assert.deepEqual([formOf(setup).handicap, setup.goKomi()], ['3', 0.5]);
    setup.setOpponent('anyone');
    assert.equal(setup.handicap(), 3);
    assert.equal(setup.effectiveHandicap(), 0);
    assert.equal(formOf(setup).handicap, undefined);
    assert.equal(setup.goKomi(), 6.5, 'an even game has the standard komi');
    setup.setOpponent('link');
    assert.deepEqual([formOf(setup).handicap, setup.goKomi()], ['3', 0.5]);
  });

  test('a komi the player chose survives the switch both ways', () => {
    const { setup } = lobby();
    setup.openModal('friend');
    setup.setHandicap(2);
    setup.setGoKomi('3.5');
    setup.setOpponent('anyone');
    assert.equal(setup.goKomi(), 3.5);
    setup.setOpponent('link');
    assert.equal(setup.goKomi(), 3.5);
  });

  test('a guest switching to Anyone gets real time, the one clock a guest’s open game has', () => {
    const { setup } = lobby(false);
    setup.openModal('friend');
    setup.timeControl.mode('correspondence');
    setup.setOpponent('anyone');
    assert.equal(setup.timeControl.mode(), 'realTime');
    assert.deepEqual(setup.timeControl.modes, ['realTime']);
  });

  test('the rating range belongs to an open game and is not sent to a challenge', () => {
    const { setup } = lobby();
    setup.openModal('hook');
    assert.notEqual(formOf(setup).ratingRange, undefined);
    assert.equal(setup.advancedDigest().split(' · ').length, 4, 'the digest ends with the ranks');
    setup.setOpponent('link');
    assert.equal(setup.advancedDigest().split(' · ').length, 3);
  });
});

describe('the one remembered store', () => {
  test('an open game and a challenge share their settings', () => {
    const { setup } = lobby();
    setup.openModal('hook');
    setup.setGoSize(9);
    setup.gameMode('rated');
    const again = lobby().setup;
    again.openModal('friend');
    assert.deepEqual([again.goSize(), again.gameMode()], [9, 'rated']);
    assert.ok(localStorage.getItem(key('custom')));
  });

  test('settings from the old open-game window come first, then the old challenge window’s', () => {
    localStorage.setItem(
      key('friend'),
      JSON.stringify({ goSize: 13, timeMode: 'correspondence', time: 5, increment: 3, days: 3 }),
    );
    let setup = lobby().setup;
    setup.openModal('hook');
    assert.deepEqual(
      [setup.goSize(), setup.timeControl.mode(), setup.timeControl.days()],
      [13, 'correspondence', 3],
    );
    localStorage.clear();
    localStorage.setItem(key('friend'), JSON.stringify({ goSize: 13 }));
    localStorage.setItem(key('hook'), JSON.stringify({ goSize: 9 }));
    setup = lobby().setup;
    setup.openModal('hook');
    assert.equal(setup.goSize(), 9);
  });

  test('once the shared store exists the old ones are no longer read', () => {
    localStorage.setItem(key('hook'), JSON.stringify({ goSize: 9 }));
    const first = lobby().setup;
    first.openModal('hook');
    first.setGoSize(19);
    localStorage.setItem(key('hook'), JSON.stringify({ goSize: 13 }));
    const second = lobby().setup;
    second.openModal('hook');
    assert.equal(second.goSize(), 19);
  });

  test('a broken old store is skipped', () => {
    localStorage.setItem(key('hook'), '{not json');
    localStorage.setItem(key('friend'), JSON.stringify({ goSize: 9 }));
    const { setup } = lobby();
    setup.openModal('hook');
    assert.equal(setup.goSize(), 9);
  });
});

describe('the presets', () => {
  test('are ADR 0005’s shapes, with the clocks of the server’s own tiles', () => {
    const presets = customPresets(pools, corres);
    assert.deepEqual(
      presets.map(p => [p.label, p.detail, p.clock]),
      [
        [
          '19×19 site.rapid',
          '10+5×30s',
          { goSize: 19, timeMode: 'byoyomi', time: 10, periods: 5, periodTime: 30 },
        ],
        [
          '9×9 site.blitz',
          '3+3×20s',
          { goSize: 9, timeMode: 'byoyomi', time: 3, periods: 3, periodTime: 20 },
        ],
        ['site.correspondence', '1 days', { goSize: 19, timeMode: 'correspondence', days: 1 }],
      ],
    );
  });

  test('a preset the server has no tile for is left out; Fischer tiles are real time', () => {
    assert.equal(customPresets([], []).length, 0);
    assert.deepEqual(customPresets([pools[3]], [])[0].clock, {
      goSize: 19,
      timeMode: 'realTime',
      time: 10,
      increment: 10,
    });
    assert.equal(customPresets(pools, [corres[0]])[2].clock.days, 3);
  });

  test('a preset fills the size and the clock and the ruleset’s standard komi, and leaves the rest', () => {
    const { setup } = lobby();
    setup.openModal('hook');
    setup.setGoRuleset('chinese');
    setup.gameMode('rated');
    setup.applyPreset(setup.presets()[1]);
    assert.deepEqual(
      [
        setup.goSize(),
        setup.timeControl.mode(),
        setup.timeControl.time(),
        setup.timeControl.periods(),
        setup.timeControl.periodTime(),
      ],
      [9, 'byoyomi', 3, 3, 20],
    );
    assert.deepEqual([setup.goRuleset(), setup.goKomi(), setup.gameMode()], ['chinese', 7.5, 'rated']);
    assert.equal(setup.activePreset()?.id, '9-blitz');
    setup.applyPreset(setup.presets()[2]);
    assert.deepEqual(
      [setup.timeControl.mode(), setup.timeControl.days(), setup.goSize()],
      ['correspondence', 1, 19],
    );
  });

  test('a preset keeps the stones of a challenge and their komi', () => {
    const { setup } = lobby();
    setup.openModal('friend');
    setup.setHandicap(2);
    setup.applyPreset(setup.presets()[0]);
    assert.deepEqual([setup.handicap(), setup.goKomi()], [2, 0.5]);
  });

  test('Last settings goes back to how the window opened', () => {
    const { setup } = lobby();
    setup.openModal('hook');
    const opened = [setup.goSize(), setup.timeControl.mode(), setup.timeControl.time()];
    setup.setGoSize(13);
    setup.applyPreset(setup.presets()[0]);
    assert.notDeepEqual([setup.goSize(), setup.timeControl.mode()], opened.slice(0, 2));
    setup.restoreLast();
    assert.deepEqual([setup.goSize(), setup.timeControl.mode(), setup.timeControl.time()], opened);
  });

  test('a guest’s open game has no correspondence preset', () => {
    const { setup } = lobby(false);
    setup.openModal('hook');
    assert.deepEqual(
      setup.presets().map(p => p.id),
      ['19-rapid', '9-blitz'],
    );
    setup.setOpponent('link');
    assert.equal(setup.presets().length, 3);
  });

  test('a guest’s presets take real Fischer clocks, the only clock their open game has, and light up', () => {
    const { setup } = lobby(false);
    setup.openModal('hook');
    assert.deepEqual(
      setup.presets().map(p => p.clock),
      [
        { goSize: 19, timeMode: 'realTime', time: 10, increment: 10 },
        { goSize: 9, timeMode: 'realTime', time: 3, increment: 2 },
      ],
    );
    for (const preset of setup.presets()) {
      setup.applyPreset(preset);
      assert.equal(setup.activePreset()?.id, preset.id);
      assert.deepEqual(
        [setup.timeControl.mode(), setup.timeControl.time(), setup.timeControl.increment()],
        ['realTime', preset.clock.time, preset.clock.increment],
      );
    }
  });

  test('a preset with no tile of an allowed clock is left out', () => {
    assert.deepEqual(
      customPresets([pools[0], pools[1]], corres, ['realTime']).map(p => p.id),
      [],
    );
  });

  test('the row marks the preset that fits and otherwise Last settings, and a click applies one', () => {
    const { setup } = lobby();
    setup.openModal('hook');
    const pressed = () =>
      [...mount(presetRow(setup)).querySelectorAll('button')]
        .filter(b => b.getAttribute('aria-pressed') === 'true')
        .map(b => b.querySelector('strong')!.textContent);
    assert.deepEqual(pressed(), ['site.goLastSettings']);
    mount(presetRow(setup)).querySelectorAll('button')[2].click();
    assert.deepEqual(pressed(), ['9×9 site.blitz']);
    // settings that are neither the opening ones nor a preset light nothing
    setup.setGoSize(13);
    assert.deepEqual(pressed(), []);
    assert.equal(setup.lastActive(), false);
    assert.ok(
      presetMatches(setup.presets()[1], { ...setup.store(), goSize: 9, time: 3, periods: 3, periodTime: 20 }),
    );
  });
});

describe('what the store keeps', () => {
  const advice: HandicapAdvice = {
    19: { suggested: 3, min: 2, max: 4 },
    9: { suggested: 1, min: 0, max: 2 },
    black: true,
  };
  const realFetch = globalThis.fetch;
  const flush = () => new Promise(resolve => setTimeout(resolve, 0));
  beforeEach(() => {
    globalThis.fetch = async () => new Response(JSON.stringify(advice), { status: 200 });
  });
  const stored = () => JSON.parse(localStorage.getItem(key('custom'))!);

  test('an untouched suggestion stays out of the store, even after switching to the link', async () => {
    const { setup } = lobby();
    setup.openModal('friend', undefined, 'bob');
    await flush();
    globalThis.fetch = realFetch;
    assert.equal(setup.handicap(), 3);
    assert.deepEqual([stored().handicap, stored().goKomi], [0, 6.5]);
    setup.setOpponent('link');
    assert.deepEqual([setup.handicap(), setup.goKomi()], [0, 6.5]);
    assert.deepEqual([stored().handicap, stored().goKomi], [0, 6.5]);
  });

  test('stones the player picked, or sent, are remembered', async () => {
    const picked = lobby().setup;
    picked.openModal('friend', undefined, 'bob');
    await flush();
    picked.chooseHandicap(2);
    assert.deepEqual([stored().handicap, stored().goKomi], [2, 0.5]);
    localStorage.clear();
    const sent = lobby().setup;
    globalThis.fetch = async () => new Response(JSON.stringify(advice), { status: 200 });
    sent.openModal('friend', undefined, 'bob');
    await flush();
    globalThis.fetch = async () => new Response('{}', { status: 200, headers: { location: '/' } });
    await sent.submit();
    globalThis.fetch = realFetch;
    assert.equal(stored().handicap, 3);
  });

  test('the old challenge window’s Unlimited clock is not carried over', () => {
    localStorage.setItem(key('friend'), JSON.stringify({ goSize: 9, timeMode: 'unlimited' }));
    const { setup } = lobby();
    setup.openModal('hook');
    assert.deepEqual([setup.goSize(), setup.timeControl.mode()], [9, 'realTime']);
  });
});

describe('a clock a link fixed', () => {
  test('is dropped on Anyone when an open game can’t have it, so the button isn’t disabled for nothing', () => {
    const { setup } = lobby(false);
    setup.openModal('friend', { timeMode: 'correspondence', days: 3 });
    assert.ok(setup.valid());
    setup.setOpponent('anyone');
    assert.equal(setup.timeControl.mode(), 'realTime');
    assert.ok(setup.valid());
  });
});

describe('the Rated / Casual start', () => {
  test('follows the lobby’s chips only when nothing was stored', () => {
    const first = lobby().setup;
    first.openModal('hook', undefined, undefined, { gameMode: 'rated' });
    assert.equal(first.gameMode(), 'rated');
    first.gameMode('casual');
    const second = lobby().setup;
    second.openModal('hook', undefined, undefined, { gameMode: 'rated' });
    assert.equal(second.gameMode(), 'casual');
  });

  test('a guest stays casual', () => {
    const { setup } = lobby(false);
    setup.openModal('hook', undefined, undefined, { gameMode: 'rated' });
    assert.equal(setup.gameMode(), 'casual');
  });

  test('a clock to start on is used, but a live list keeps a byo-yomi clock', () => {
    const first = lobby().setup;
    first.openModal('hook', undefined, undefined, { timeMode: 'correspondence' });
    assert.equal(first.timeControl.mode(), 'correspondence');
    first.timeControl.mode('byoyomi');
    const second = lobby().setup;
    second.openModal('hook', undefined, undefined, { timeMode: 'realTime' });
    assert.equal(second.timeControl.mode(), 'byoyomi');
    first.timeControl.mode('unlimited');
    const third = lobby().setup;
    third.openModal('hook', undefined, undefined, { timeMode: 'realTime' });
    assert.equal(third.timeControl.mode(), 'realTime');
  });
});

describe('the advanced options', () => {
  test('are folded by default, with a digest of ruleset, komi, stones and ranks', () => {
    const { setup } = lobby();
    setup.openModal('hook');
    assert.equal(setup.advancedOpen(), false);
    assert.match(setup.advancedDigest(), /^site\.goRulesJapanese · site\.goKomi 6\.5 · site\.goEven/);
  });

  test('open by themselves when a link fixed one of them', () => {
    for (const forced of [{ goRuleset: 'chinese' as const }, { goKomi: 5.5 }, { handicap: 2, goKomi: 0.5 }]) {
      const { setup } = lobby();
      setup.openModal('friend', forced);
      assert.equal(setup.advancedOpen(), true, JSON.stringify(forced));
      localStorage.clear();
    }
    const { setup } = lobby();
    setup.openModal('friend', { goSize: 9, timeMode: 'realTime', time: 5, increment: 3 });
    assert.equal(setup.advancedOpen(), false, 'a link that fixed the board and clock only');
  });

  test('open by themselves when a rated game can’t be rated for a reason in them', () => {
    const { setup } = lobby();
    setup.openModal('hook', { mode: 'rated' });
    assert.equal(setup.advancedOpen(), false);
    setup.setGoKomi('0.5');
    assert.equal(setup.advancedOpen(), true);
  });

  test('the player’s own opening or closing wins over the automatic one', () => {
    const { setup } = lobby();
    setup.openModal('friend', { goKomi: 5.5 });
    assert.equal(setup.advancedOpen(), true);
    setup.advancedChoice = false;
    assert.equal(setup.advancedOpen(), false);
    setup.openModal('friend', { goKomi: 5.5 });
    assert.equal(setup.advancedOpen(), true, 'a new window starts from the automatic rule again');
  });

  test('the digest shows the stones of a challenge and the ranks of an open game', () => {
    const { setup } = lobby();
    setup.openModal('friend');
    setup.setHandicap(3);
    assert.match(setup.advancedDigest(), /site\.goKomi 0\.5 · 3 stones$/);
    setup.setOpponent('anyone');
    assert.match(setup.advancedDigest(), /site\.goEven · /);
  });
});

describe('the suggested stones for a named opponent', () => {
  const advice: HandicapAdvice = {
    19: { suggested: 5, min: 4, max: 6 },
    9: { suggested: 1, min: 0, max: 2 },
    black: true,
  };
  const realFetch = globalThis.fetch;
  const flush = () => new Promise(resolve => setTimeout(resolve, 0));
  beforeEach(() => {
    globalThis.fetch = async () => new Response(JSON.stringify(advice), { status: 200 });
  });
  const restore = () => (globalThis.fetch = realFetch);

  test('fill the stones, and the komi follows', async () => {
    const { setup } = lobby();
    setup.openModal('friend', undefined, 'Shiro');
    assert.equal(setup.handicap(), 0);
    await flush();
    restore();
    assert.deepEqual([setup.handicap(), setup.goKomi()], [5, 0.5]);
    assert.equal(setup.advancedOpen(), true, 'a non-zero suggestion opens the advanced options');
  });

  test('replace the stones remembered from last time', async () => {
    localStorage.setItem(key('custom'), JSON.stringify({ handicap: 2, goKomi: 0.5 }));
    const { setup } = lobby();
    setup.openModal('friend', undefined, 'Shiro');
    await flush();
    restore();
    assert.equal(setup.handicap(), 5);
  });

  test('follow the board size until the player picks the stones', async () => {
    const { setup } = lobby();
    setup.openModal('friend', undefined, 'Shiro');
    await flush();
    restore();
    setup.setGoSize(9);
    assert.equal(setup.handicap(), 1);
    setup.setGoSize(19);
    assert.equal(setup.handicap(), 5);
    setup.setGoSize(13);
    assert.equal(setup.handicap(), 0, 'a board with no suggestion plays even');
    setup.setGoSize(19);
    setup.chooseHandicap(3);
    setup.setGoSize(9);
    assert.equal(setup.handicap(), 3, 'the player’s own pick stays');
  });

  test('never replace the stones a link fixed', async () => {
    const { setup } = lobby();
    setup.openModal('friend', { handicap: 2, goKomi: 0.5 }, 'Shiro');
    await flush();
    restore();
    assert.equal(setup.handicap(), 2);
    setup.setGoSize(9);
    assert.equal(setup.handicap(), 2);
  });

  test('wait for the player to choose the named opponent when the window starts on Anyone', async () => {
    const { setup } = lobby();
    setup.openModal('hook', undefined, 'Shiro');
    await flush();
    restore();
    assert.equal(setup.handicap(), 0);
    assert.equal(setup.advancedOpen(), false);
    setup.setOpponent('named');
    assert.equal(setup.handicap(), 5);
    assert.equal(setup.advancedOpen(), true);
    setup.setOpponent('anyone');
    assert.equal(setup.effectiveHandicap(), 0);
  });

  test('colours come from the ranks for a rated handicap challenge', async () => {
    const { setup } = lobby();
    setup.openModal('friend', { mode: 'rated' }, 'Shiro');
    await flush();
    restore();
    assert.equal(setup.lockedColor(), 'black');
    assert.ok(setup.valid());
    assert.equal(setup.friendUser, 'Shiro');
  });
});
