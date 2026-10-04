import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { Hook, Pool, Seek } from '../src/interfaces';
import {
  casualHookForm,
  columns,
  corresSeekForm,
  effectiveChips,
  elapsed,
  hookMatchesPool,
  ownHook,
  ownSeek,
  parseQuickChips,
  rangeText,
  tileCount,
  type CorresTile,
} from '../src/quickPair';

// Unit 6.6: the quick-pairing view's logic (ADR 0022 §1, §2, §4).

const fischer: Pool = { id: '9x9-3m-2s', size: 9, clock: '3+2', speed: 'blitz', lim: 3, inc: 2 };
const byo: Pool = {
  id: '19x19-10m-5x30s',
  size: 19,
  clock: '10+5×30s',
  speed: 'rapid',
  byo: { limit: 600, periods: 5, period: 30 },
};
const nineByo: Pool = {
  id: '9x9-1m-5x10s',
  size: 9,
  clock: '1+5×10s',
  speed: 'rapid',
  byo: { limit: 60, periods: 5, period: 10 },
};
const oneDay: CorresTile = { id: '19x19-1d', days: 1, go: { size: 19, rules: 'japanese', komi: 6.5 } };
const threeDays: CorresTile = { id: '19x19-3d', days: 3, go: { size: 19, rules: 'japanese', komi: 6.5 } };

const hook = (over: Partial<Hook> = {}): Hook => ({
  id: 'h1',
  sri: 's1',
  clock: '3+2',
  t: 260,
  s: 2,
  i: 2,
  variant: 'standard',
  perf: 'blitz',
  go: { size: 9, rules: 'japanese', komi: 6.5 },
  auth: false,
  action: 'join',
  ...over,
});

describe('the chip row', () => {
  test('a stored choice is read back; anything else gives Rated and Handicap OK', () => {
    assert.deepEqual(parseQuickChips('{"rated":false,"handicap":false}'), { rated: false, handicap: false });
    assert.deepEqual(parseQuickChips(null), { rated: true, handicap: true });
    assert.deepEqual(parseQuickChips('{"rated":"yes"}'), { rated: true, handicap: true });
    assert.deepEqual(parseQuickChips('not json'), { rated: true, handicap: true });
  });

  test('guests play casual, and casual quick games are even', () => {
    assert.deepEqual(effectiveChips({ rated: true, handicap: true }, true), { rated: true, handicap: true });
    assert.deepEqual(effectiveChips({ rated: true, handicap: true }, false), {
      rated: false,
      handicap: false,
    });
    assert.deepEqual(effectiveChips({ rated: false, handicap: true }, true), {
      rated: false,
      handicap: false,
    });
    assert.deepEqual(effectiveChips({ rated: true, handicap: false }, true), {
      rated: true,
      handicap: false,
    });
  });
});

describe('the tiles', () => {
  test('three columns: 9×9, 19×19, then correspondence, in the server order', () => {
    const cols = columns([nineByo, fischer, byo], [oneDay, threeDays]);
    assert.deepEqual(
      cols.map(c => [
        c.key,
        c.title === 'correspondence' ? '' : c.title,
        c.pools.map(p => p.id),
        c.corres.length,
      ]),
      [
        ['9', '9×9', ['9x9-1m-5x10s', '9x9-3m-2s'], 0],
        ['19', '19×19', ['19x19-10m-5x30s'], 0],
        ['corres', cols[2].title, [], 2],
      ],
    );
  });

  test('a casual open game matches a tile only with its clock, size, Japanese rules, standard komi, even', () => {
    assert.ok(hookMatchesPool(hook(), fischer));
    assert.ok(!hookMatchesPool(hook({ ra: 1 }), fischer), 'rated');
    assert.ok(!hookMatchesPool(hook({ clock: '3+0' }), fischer), 'clock');
    assert.ok(!hookMatchesPool(hook({ go: { size: 19, rules: 'japanese', komi: 6.5 } }), fischer), 'size');
    assert.ok(!hookMatchesPool(hook({ go: { size: 9, rules: 'chinese', komi: 7.5 } }), fischer), 'rules');
    assert.ok(!hookMatchesPool(hook({ go: { size: 9, rules: 'japanese', komi: 0.5 } }), fischer), 'komi');
    assert.ok(
      !hookMatchesPool(hook({ go: { size: 9, rules: 'japanese', komi: 0.5, handicap: 2 } }), fischer),
    );
    const byoHook = hook({ clock: '10+5×30s', go: { size: 19, rules: 'japanese', komi: 6.5 } });
    assert.ok(hookMatchesPool(byoHook, byo));
    assert.ok(!hookMatchesPool(byoHook, fischer));
  });

  test('with Rated a tile counts its pool; with Casual the open games you could join', () => {
    const guest = { username: undefined, rating: undefined };
    const sizes = { '9x9-3m-2s': 3 };
    assert.equal(tileCount(fischer, true, sizes, [], guest), 3);
    assert.equal(tileCount(byo, true, sizes, [], guest), 0);
    const hooks = [
      hook({ id: 'a' }), // a guest's: a guest can join it
      hook({ id: 'b', u: 'kaya', auth: true }), // a member's: not for a guest
      hook({ id: 'c', action: 'cancel' }), // your own
      hook({ id: 'd', clock: '3+0' }), // another clock
    ];
    assert.equal(tileCount(fischer, false, {}, hooks, guest), 1);
    assert.equal(tileCount(fischer, false, {}, hooks, { username: 'carol', rating: 1500 }), 1);
  });

  test('your own open game and seek for a tile are found for Cancel', () => {
    assert.equal(ownHook(fischer, [hook({ id: 'x' }), hook({ id: 'mine', action: 'cancel' })])?.id, 'mine');
    assert.equal(ownHook(byo, [hook({ id: 'mine', action: 'cancel' })]), undefined);
    const seek = (id: string, days: number, action: Seek['action']): Seek => ({
      id,
      username: 'carol',
      rating: 1500,
      mode: 1,
      days,
      perf: { key: 'correspondence' },
      go: { size: 19, rules: 'japanese', komi: 6.5 },
      action,
    });
    const seeks = [
      seek('other', 1, 'joinSeek'),
      seek('three', 3, 'cancelSeek'),
      seek('one', 1, 'cancelSeek'),
    ];
    assert.equal(ownSeek(oneDay, seeks)?.id, 'one');
    assert.equal(ownSeek(threeDays, seeks)?.id, 'three');
  });
});

describe('what a click sends', () => {
  test('Casual: a casual open game with the tile settings', () => {
    assert.deepEqual(casualHookForm(nineByo), {
      variant: 1,
      days: 1,
      color: 'random',
      size: 9,
      timeMode: 3,
      time: 1,
      increment: 0,
      periods: 5,
      periodTime: 10,
      mode: 0,
    });
  });

  test('a correspondence tile: a seek with its days, rated or casual from the chips', () => {
    assert.deepEqual(corresSeekForm(threeDays, true), {
      variant: 1,
      timeMode: 2,
      days: 3,
      time: 0,
      increment: 0,
      color: 'random',
      size: 19,
      ruleset: 'japanese',
      mode: 1,
    });
    assert.equal(corresSeekForm(oneDay, false).mode, 0);
  });
});

describe('waiting on a tile', () => {
  test('the ranks you can meet, and the time since your click', () => {
    assert.equal(rangeText({ id: 'p', weakest: '3k', strongest: '1d', stones: 0 }), '3k–1d');
    assert.equal(rangeText({ id: 'p', weakest: '5k', strongest: '5k', stones: 0 }), '5k');
    assert.equal(elapsed(0), '0:00');
    assert.equal(elapsed(7400), '0:07');
    assert.equal(elapsed(90_000), '1:30');
    assert.equal(elapsed(-50), '0:00');
  });
});
