import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { Byoyomi } from '../src/byoyomi';

// 10 minutes, then 5 periods of 30 s (ADR 0020 §7).
const clock = (white: number, black: number, w = 5, b = 5) => ({ white, black, periods: { b, w }, byo: 30 });

describe('byo-yomi periods on the round page', () => {
  test('main time: "+5×30s"; the clock reaching zero starts the first period, not a flag', () => {
    const b = new Byoyomi(30, 600, clock(600, 590));
    assert.equal(b.label('black'), '+5×30s');
    assert.equal(b.inByoyomi.black, false);
    assert.equal(b.expire('black'), true);
    assert.equal(b.label('black'), '5×30s', 'main time over, the same 5 periods left');
  });

  test('each period that runs out is used up; the last one is a flag', () => {
    const b = new Byoyomi(30, 600, clock(600, 12, 5, 2));
    assert.equal(b.inByoyomi.black, true, 'a clock showing a period or less is in byo-yomi');
    assert.equal(b.expire('black'), true);
    assert.equal(b.periods.black, 1);
    assert.equal(b.expire('black'), false);
    assert.equal(b.periods.black, 0);
  });

  test("the server's clock events correct the periods; byo-yomi never goes back to main time", () => {
    const b = new Byoyomi(30, 600, clock(600, 600));
    b.update(clock(400, 25, 5, 4));
    assert.deepEqual([b.periods.black, b.inByoyomi.black], [4, true]);
    b.update(clock(400, 29.5, 5, 4));
    assert.equal(b.inByoyomi.black, true);
    assert.equal(b.inByoyomi.white, false);
  });

  test("the server's word on main time wins over the guess, both ways", () => {
    const b = new Byoyomi(30, 600, { ...clock(600, 25), inByo: { b: false, w: false } });
    assert.equal(b.label('black'), '+5×30s', '25 s of main time left, not a period');
    assert.equal(b.expire('black'), true);
    assert.equal(b.periods.black, 5, 'main time ending uses no period');
    b.update({ ...clock(600, 40), inByo: { b: true, w: false } });
    assert.equal(b.inByoyomi.black, true);
  });

  test('no main time: in byo-yomi from the start', () => {
    const b = new Byoyomi(30, 0, clock(30, 30));
    assert.equal(b.label('white'), '5×30s');
  });
});
