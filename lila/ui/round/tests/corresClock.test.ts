import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { CorresClockController } from '../src/corresClock/corresClockCtrl';
import type RoundController from '../src/ctrl';
import { timeLeft } from '../src/view/scoring';

// Unit 7.7: the days clock stands still in a correspondence game's scoring phase (ADR 0023 §4), and
// the phase's own countdown reads in the unit that fits.

describe('the days clock', () => {
  let tickers: Array<() => void> = [];
  const realSetInterval = globalThis.setInterval;
  const realClearInterval = globalThis.clearInterval;

  beforeEach(() => {
    tickers = [];
    // The clock ticks once a second on a real timer: capture its callback and call it by hand.
    (globalThis as any).setInterval = (f: () => void) => tickers.push(f);
    (globalThis as any).clearInterval = () => {};
  });
  afterEach(() => {
    globalThis.setInterval = realSetInterval;
    globalThis.clearInterval = realClearInterval;
  });

  const clock = (scoring: boolean, flagged: string[], statusId = 20) => {
    const root = {
      data: { correspondence: {}, game: { player: 'white' as Color, status: { id: statusId } } },
      corresClock: {},
      inScoring: () => scoring,
      redraw: () => {},
    } as unknown as RoundController;
    const data = { daysPerTurn: 3, increment: 3 * 86400, white: 100, black: 200, showBar: false };
    const c = new CorresClockController(root, data, () => void flagged.push('flag'));
    root.corresClock = c;
    return c;
  };

  test("runs down the turn colour's time, and flags at zero", () => {
    const flagged: string[] = [];
    const c = clock(false, flagged);
    c.times.white = 10_000;
    c.times.lastUpdate = performance.now() - 4_000;
    tickers[0]();
    assert.ok(c.millisOf('white') < 6_100 && c.millisOf('white') > 5_000, String(c.millisOf('white')));
    assert.equal(c.millisOf('black'), 200_000);
    c.times.lastUpdate = performance.now() - 60_000;
    tickers[0]();
    assert.deepEqual(flagged, ['flag']);
  });

  test('stands still in the scoring phase: nobody runs out, nothing is taken off', () => {
    const flagged: string[] = [];
    const c = clock(true, flagged);
    c.times.white = 1_000;
    c.times.lastUpdate = performance.now() - 60_000;
    tickers[0]();
    assert.deepEqual(flagged, [], 'the day does not run out while the count is awaited');
    assert.equal(c.millisOf('white'), 1_000);
  });

  test('stands still once the game is over: a finished game never flags', () => {
    const flagged: string[] = [];
    const c = clock(false, flagged, 31); // resigned
    c.times.white = 1_000;
    c.times.lastUpdate = performance.now() - 60_000;
    tickers[0]();
    assert.deepEqual(flagged, []);
    assert.equal(c.millisOf('white'), 1_000);
  });
});

describe('the scoring phase countdown', () => {
  const MIN = 60,
    HOUR = 3600,
    DAY = 86400;

  test('a real-time game counts minutes and seconds', () => {
    assert.equal(timeLeft(180), '3:00');
    assert.equal(timeLeft(59), '0:59');
    assert.equal(timeLeft(0), '0:00');
    assert.equal(timeLeft(-5), '0:00');
  });

  test('a correspondence game counts hours, then days', () => {
    assert.equal(timeLeft(HOUR - 1), '59:59', 'under an hour is still minutes and seconds');
    assert.equal(timeLeft(HOUR), 'site.nbHours(1)');
    assert.equal(timeLeft(5 * HOUR + 12 * MIN + 59), 'site.nbHours(5) site.nbMinutes(12)');
    assert.equal(timeLeft(23 * HOUR + 59 * MIN), 'site.nbHours(23) site.nbMinutes(59)');
    assert.equal(timeLeft(DAY), 'site.nbDays(1)', "ADR 0020's day, as the phase opens");
    assert.equal(timeLeft(DAY + 3 * HOUR + 40 * MIN), 'site.nbDays(1) site.nbHours(3)');
  });

  test('a part that is zero is left out', () => {
    assert.equal(timeLeft(2 * HOUR), 'site.nbHours(2)');
    assert.equal(timeLeft(2 * DAY + 20 * MIN), 'site.nbDays(2)');
  });
});
