import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { Pool } from '../src/interfaces';
import { anonPoolSeekForm, fischerPresets, poolForClock, poolFromHash } from '../src/poolList';

// ADR 0022 §1's seven pools as the server sends them (modules/pool/src/main/PoolConfig.scala)
const byo = (
  id: string,
  size: number,
  clock: string,
  limit: number,
  periods: number,
  period: number,
): Pool => ({
  id,
  size,
  clock,
  speed: 'rapid',
  byo: { limit, periods, period },
});
const fischer = (id: string, size: number, lim: number, inc: number): Pool => ({
  id,
  size,
  clock: `${lim}+${inc}`,
  speed: 'blitz',
  lim,
  inc,
});
const pools: Pool[] = [
  byo('9x9-1m-5x10s', 9, '1+5×10s', 60, 5, 10),
  byo('9x9-3m-3x20s', 9, '3+3×20s', 180, 3, 20),
  fischer('9x9-3m-2s', 9, 3, 2),
  byo('19x19-5m-5x10s', 19, '5+5×10s', 300, 5, 10),
  byo('19x19-10m-5x30s', 19, '10+5×30s', 600, 5, 30),
  byo('19x19-20m-5x30s', 19, '20+5×30s', 1200, 5, 30),
  fischer('19x19-10m-10s', 19, 10, 10),
];

describe('pool links (#pool/...)', () => {
  test('a link names a pool by its id, with an optional player to avoid', () => {
    assert.deepEqual(poolFromHash('#pool/9x9-3m-2s', pools), { id: '9x9-3m-2s' });
    assert.deepEqual(poolFromHash('#pool/19x19-10m-5x30s/bob', pools), {
      id: '19x19-10m-5x30s',
      blocking: 'bob',
    });
  });

  test('an old clock-only link finds the Fischer pool with that clock, or nothing', () => {
    assert.deepEqual(poolFromHash('#pool/10+10/bob', pools), { id: '19x19-10m-10s', blocking: 'bob' });
    assert.deepEqual(poolFromHash('#pool/3+2', pools), { id: '9x9-3m-2s' });
    assert.equal(poolFromHash('#pool/10+0', pools), undefined);
  });

  test('an unknown pool or a malformed link is ignored', () => {
    assert.equal(poolFromHash('#pool/13x13-5m-5x10s', pools), undefined);
    assert.equal(poolFromHash('#pool/', pools), undefined);
    assert.equal(poolFromHash('#friend', pools), undefined);
  });
});

describe("a guest's click on a tile", () => {
  test("sends a casual byo-yomi hook with the tile's size and periods", () => {
    assert.deepEqual(anonPoolSeekForm(pools[0]), {
      variant: 1,
      days: 1,
      color: 'random',
      size: 9,
      timeMode: 3,
      time: 1,
      increment: 0,
      periods: 5,
      periodTime: 10,
    });
  });

  test("sends a Fischer hook with the tile's size and clock", () => {
    assert.deepEqual(anonPoolSeekForm(pools[6]), {
      variant: 1,
      days: 1,
      color: 'random',
      size: 19,
      timeMode: 1,
      time: 10,
      increment: 10,
    });
  });
});

describe('the create-game window and the pools', () => {
  test('a hook joins the pool with its board size and clock', () => {
    assert.equal(poolForClock(pools, 9, { lim: 3, inc: 2 })?.id, '9x9-3m-2s');
    assert.equal(poolForClock(pools, 19, { lim: 3, inc: 2 }), undefined);
    assert.equal(
      poolForClock(pools, 19, { byo: { limit: 600, periods: 5, period: 30 } })?.id,
      '19x19-10m-5x30s',
    );
    assert.equal(poolForClock(pools, 19, { byo: { limit: 600, periods: 3, period: 30 } }), undefined);
    assert.equal(poolForClock(pools, 9, { byo: { limit: 180, periods: 3, period: 20 } })?.id, '9x9-3m-3x20s');
  });

  test("the real-time tab's presets are the Fischer pools' clocks", () => {
    assert.deepEqual(fischerPresets(pools), [
      { lim: 3, inc: 2 },
      { lim: 10, inc: 10 },
    ]);
  });
});
