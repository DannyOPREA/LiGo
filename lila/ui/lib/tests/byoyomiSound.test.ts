import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { makeByoyomiSounds } from '../src/game/clock/byoyomiSound';

describe('byo-yomi sounds', () => {
  test('entering byo-yomi plays LowTime once', () => {
    const s = makeByoyomiSounds();
    assert.equal(s.tick(3, 30), 'lowTime');
    assert.equal(s.tick(3, 30), undefined);
    assert.equal(s.tick(3, 29), undefined);
  });

  test('the last 10 seconds count down, one sound per second', () => {
    const s = makeByoyomiSounds();
    s.tick(3, 12);
    assert.equal(s.tick(3, 11), undefined);
    assert.equal(s.tick(3, 10), 'countDown10');
    assert.equal(s.tick(3, 10), undefined);
    assert.equal(s.tick(3, 9), 'countDown9');
    assert.equal(s.tick(3, 1), 'countDown1');
    assert.equal(s.tick(3, 0), undefined);
  });

  test('using up a period plays LowTime, down to the last period', () => {
    const s = makeByoyomiSounds();
    s.tick(2, 3);
    assert.equal(s.tick(1, 30), 'lowTime');
    assert.equal(s.tick(1, 10), 'countDown10');
  });

  test('a new turn refills the period without LowTime', () => {
    const s = makeByoyomiSounds();
    s.tick(3, 5);
    assert.equal(s.tick(3, 30), undefined);
  });

  test('no periods left plays nothing; reset starts over', () => {
    const s = makeByoyomiSounds();
    s.tick(1, 1);
    assert.equal(s.tick(0, 0), undefined);
    s.reset();
    assert.equal(s.tick(1, 30), 'lowTime');
  });
});
