import assert from 'node:assert/strict';
// The handicap 0/1 rule (ADR 0020 §1: goban-engine 8.3.226 gives White 1 point of compensation
// for `handicap: 1`, which R-HCP-2/R-KOMI-3 forbid, so this package never passes 1). See also
// test/conformance.test.ts's `ligo-handicap-one-no-compensation-chinese`, the fixture form of
// this same case.
//
// Licence: MIT (LiGo's own code, ADR 0006).
import { test } from 'node:test';

import { parseBoard } from '../src/board.ts';
import { effectiveHandicap, countGiven } from '../src/score.ts';

test('effectiveHandicap: 0 and 1 both become 0; 2 and up pass through', () => {
  assert.equal(effectiveHandicap(0), 0);
  assert.equal(effectiveHandicap(1), 0);
  assert.equal(effectiveHandicap(2), 2);
  assert.equal(effectiveHandicap(9), 9);
});

test('countGiven: a 1-stone handicap Chinese game gets no compensation', () => {
  // One black stone (the handicap stone would have been placed by lila, not by this package),
  // otherwise empty: this is the case ADR 0020 §1 calls out by name.
  const board = parseBoard(['b8', ...Array(8).fill('9')].join('/'), 9);
  const oneStone = countGiven(board, 'c', 0.5, 1, [], { b: 0, w: 0 });
  const noHandicap = countGiven(board, 'c', 0.5, 0, [], { b: 0, w: 0 });
  assert.equal(oneStone.score.w.compensation, 0);
  assert.deepEqual(oneStone.score, noHandicap.score);
});

test('countGiven: a 2-stone handicap Chinese game does get compensation', () => {
  const board = parseBoard(['bb7', ...Array(8).fill('9')].join('/'), 9);
  const r = countGiven(board, 'c', 0.5, 2, [], { b: 0, w: 0 });
  assert.equal(r.score.w.compensation, 2);
});

test('countGiven: Japanese rules never add compensation, whatever the handicap', () => {
  const board = parseBoard(['bb7', ...Array(8).fill('9')].join('/'), 9);
  const r = countGiven(board, 'j', 0.5, 2, [], { b: 0, w: 0 });
  assert.equal(r.score.w.compensation, 0);
});
