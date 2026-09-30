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
import { goSetupName, standardKomi, validKomi } from '../src/goSetup';
import SetupController from '../src/setupCtrl';
import { goOptions } from '../src/view/setup/components/goOptions';

// The shared test setup's i18n strings are functions; the site's are strings, which snabbdom renders as
// text, so this file uses plain strings.
(globalThis as any).i18n = { site: new Proxy({}, { get: (_, key: string) => `site.${key}` }) };

const patch = snabInit([classModule, attributesModule, propsModule, eventListenersModule]);

const mount = (vnode: VNode | VNode[]): HTMLElement => {
  const root = document.createElement('div');
  const el = document.createElement('div');
  root.appendChild(el);
  patch(
    el,
    Array.isArray(vnode)
      ? { sel: 'div', data: {}, children: vnode, elm: undefined, text: undefined, key: undefined }
      : vnode,
  );
  return root;
};

const lobby = (ratingMap: Record<string, number> | null = null) => {
  const ctrl = {
    me: { username: 'alice', isBot: false },
    data: { ratingMap, seeks: [] },
    opts: { showRatings: true },
    pools: [],
    sort: 'time',
    redraw: () => {},
    leavePool: () => {},
  } as unknown as LobbyController;
  const setup = new SetupController(ctrl);
  (ctrl as any).setupCtrl = setup;
  return { ctrl, setup };
};

const formOf = (setup: SetupController) => Object.fromEntries(setup.propsToFormData('random').entries());

const storeKey = (gameType: string) => `lobby.setup.alice.${gameType}`;

beforeEach(() => localStorage.clear());

describe('the Go options helpers', () => {
  test('standard komi follows the ruleset', () => {
    assert.equal(standardKomi('japanese'), 6.5);
    assert.equal(standardKomi('chinese'), 7.5);
  });

  test('a komi must be a multiple of 0.5 no bigger than the board, as the server checks', () => {
    assert.ok(validKomi(0, 9));
    assert.ok(validKomi(-81, 9));
    assert.ok(validKomi(361, 19));
    assert.ok(!validKomi(81.5, 9));
    assert.ok(!validKomi(6.25, 19));
    assert.ok(!validKomi(NaN, 19));
  });

  test('a setup reads as size, rules and komi', () => {
    assert.equal(
      goSetupName({ size: 9, rules: 'chinese', komi: 7.5 }),
      '9×9 · site.goRulesChinese · site.goKomi 7.5',
    );
  });
});

describe('the create-game form', () => {
  test('sends a 19×19 Japanese game with 6.5 komi by default, casual', () => {
    const { setup } = lobby();
    setup.openModal('hook');
    const form = formOf(setup);
    assert.equal(form.size, '19');
    assert.equal(form.ruleset, 'japanese');
    assert.equal(form.komi, '6.5');
    assert.equal(form.mode, '0');
    assert.equal(form.variant, '1');
    assert.equal(form.fen, undefined);
    assert.ok(setup.valid());
  });

  test('sends the chosen size, ruleset and komi', () => {
    const { setup } = lobby();
    setup.openModal('friend');
    setup.setGoSize(9);
    setup.setGoRuleset('chinese');
    setup.setGoKomi('5.5');
    const form = formOf(setup);
    assert.deepEqual([form.size, form.ruleset, form.komi], ['9', 'chinese', '5.5']);
  });

  test('a new ruleset brings its standard komi', () => {
    const { setup } = lobby();
    setup.openModal('hook');
    setup.setGoKomi('3');
    setup.setGoRuleset('chinese');
    assert.equal(setup.goKomi(), 7.5);
    setup.setGoRuleset('japanese');
    assert.equal(setup.goKomi(), 6.5);
  });

  test('a smaller board keeps a komi that fits and resets one that does not', () => {
    const { setup } = lobby();
    setup.openModal('hook');
    setup.setGoKomi('0.5');
    setup.setGoSize(9);
    assert.equal(setup.goKomi(), 0.5);
    setup.setGoSize(19);
    setup.setGoKomi('200');
    setup.setGoSize(9);
    assert.equal(setup.goKomi(), 6.5);
  });

  test('a blank, half-typed or impossible komi is ignored rather than read as 0', () => {
    const { setup } = lobby();
    setup.openModal('hook');
    for (const typed of ['', ' ', '-', '6.25', '400', 'abc']) {
      setup.setGoKomi(typed);
      assert.equal(setup.goKomi(), 6.5, `after typing ${JSON.stringify(typed)}`);
    }
  });

  test('remembers the Go options for next time', () => {
    const { setup } = lobby();
    setup.openModal('friend');
    setup.setGoSize(13);
    setup.setGoRuleset('chinese');
    const again = lobby().setup;
    again.openModal('friend');
    assert.deepEqual([again.goSize(), again.goRuleset(), again.goKomi()], [13, 'chinese', 7.5]);
  });

  test('settings saved before Go (a chess variant, a position, rated) open as a casual default Go game', () => {
    localStorage.setItem(
      storeKey('hook'),
      JSON.stringify({
        variant: 'crazyhouse',
        fen: '8/8/8/8/8/8/8/8 w - - 0 1',
        timeMode: 'realTime',
        time: 5,
        increment: 3,
        days: 2,
        gameMode: 'rated',
        color: 'random',
        ratingMin: -500,
        ratingMax: 500,
      }),
    );
    const { setup } = lobby();
    setup.openModal('hook');
    const form = formOf(setup);
    assert.deepEqual(
      [form.size, form.ruleset, form.komi, form.mode, form.variant],
      ['19', 'japanese', '6.5', '0', '1'],
    );
    assert.ok(setup.valid());
  });

  test('stored Go options that are not Go options get the default', () => {
    localStorage.setItem(
      storeKey('hook'),
      JSON.stringify({
        goSize: 21,
        goRuleset: 'aga',
        goKomi: 1000,
        timeMode: 'realTime',
        time: 5,
        increment: 3,
        days: 2,
      }),
    );
    const { setup } = lobby();
    setup.openModal('hook');
    assert.deepEqual([setup.goSize(), setup.goRuleset(), setup.goKomi()], [19, 'japanese', 6.5]);
  });

  test('a rated game asked for in the URL still makes a casual game, and the button stays enabled', () => {
    const { setup } = lobby();
    setup.openModal('hook', { mode: 'rated' });
    assert.equal(setup.gameMode(), 'casual');
    assert.ok(setup.valid());
  });

  test('a reusable challenge link opens the form with its size, ruleset and komi', () => {
    const { setup } = lobby();
    setup.openModal('friend', { goSize: 9, goRuleset: 'chinese', goKomi: 5.5 });
    assert.deepEqual([setup.goSize(), setup.goRuleset(), setup.goKomi()], [9, 'chinese', 5.5]);
    localStorage.clear();
    const bad = lobby().setup;
    bad.openModal('friend', { goSize: 9, goKomi: 100 });
    assert.deepEqual([bad.goSize(), bad.goKomi()], [9, 6.5]);
  });

  test('the rating shown and the rating range are the Go rating', () => {
    const { setup } = lobby({ go: 1580, blitz: 2400 });
    setup.openModal('hook');
    assert.equal(setup.myRating(), 1580);
    assert.equal(setup.isProvisional(), false);
    assert.equal(formOf(setup).ratingRange, '1080-2080');
    const provisional = lobby({ go: -1500 }).setup;
    provisional.openModal('hook');
    assert.equal(provisional.myRating(), 1500);
    assert.equal(provisional.isProvisional(), true);
  });
});

describe('the Go options in the form', () => {
  test('offer the three board sizes, both rulesets and the komi', () => {
    const { setup } = lobby();
    setup.openModal('friend');
    const el = mount(goOptions(setup));
    const sizes = [...el.querySelectorAll<HTMLInputElement>('input[name=size]')];
    assert.deepEqual(
      sizes.map(i => [i.value, i.checked]),
      [
        ['19', true],
        ['13', false],
        ['9', false],
      ],
    );
    const rules = el.querySelector<HTMLSelectElement>('select#sf_ruleset')!;
    assert.deepEqual(
      [...rules.options].map(o => [o.value, o.text]),
      [
        ['japanese', 'site.goRulesJapanese'],
        ['chinese', 'site.goRulesChinese'],
      ],
    );
    assert.equal(rules.value, 'japanese');
    const komi = el.querySelector<HTMLInputElement>('input#sf_komi')!;
    assert.equal(komi.value, '6.5');
    assert.equal(komi.getAttribute('step'), '0.5');
    assert.equal(komi.getAttribute('max'), '361');
  });

  test('choosing in the form changes the setup', () => {
    const { setup } = lobby();
    setup.openModal('friend');
    const el = mount(goOptions(setup));
    el.querySelector<HTMLInputElement>('input#sf_size_9')!.dispatchEvent(new window.Event('change'));
    const rules = el.querySelector<HTMLSelectElement>('select#sf_ruleset')!;
    rules.value = 'chinese';
    rules.dispatchEvent(new window.Event('change'));
    const komi = el.querySelector<HTMLInputElement>('input#sf_komi')!;
    komi.value = '0.5';
    komi.dispatchEvent(new window.Event('change'));
    assert.deepEqual([setup.goSize(), setup.goRuleset(), setup.goKomi()], [9, 'chinese', 0.5]);
  });

  test('screen-reader mode offers the board sizes as a list', () => {
    const { setup } = lobby();
    setup.openModal('hook');
    (site as any).blindMode = true;
    try {
      const el = mount(goOptions(setup));
      const sizes = el.querySelector<HTMLSelectElement>('select#sf_size')!;
      assert.deepEqual(
        [...sizes.options].map(o => o.value),
        ['19', '13', '9'],
      );
      assert.equal(sizes.value, '19');
      assert.equal(el.querySelector('label[for=sf_size]')!.textContent, 'site.goBoardSize');
      sizes.value = '13';
      sizes.dispatchEvent(new window.Event('change'));
      assert.equal(setup.goSize(), 13);
    } finally {
      (site as any).blindMode = false;
    }
  });

  test('a komi the form ignores does not stay in the field', () => {
    const { setup } = lobby();
    setup.openModal('friend');
    setup.setGoSize(9);
    const el = mount(goOptions(setup));
    const komi = el.querySelector<HTMLInputElement>('input#sf_komi')!;
    komi.value = '100';
    komi.dispatchEvent(new window.Event('change'));
    assert.equal(setup.goKomi(), 6.5);
    assert.equal(komi.value, '6.5');
  });
});
