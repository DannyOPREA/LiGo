import assert from 'node:assert/strict';
// Widening dead points to whole chains, and checking a given set is already whole chains
// (ADR 0020 §1).
//
// Licence: MIT (LiGo's own code, ADR 0006).
import { test } from 'node:test';

import { parseBoard } from '../src/board.ts';
import { chainAt, widenToChains, isWholeChains } from '../src/chains.ts';

// A 3-stone black chain (aa-ba-ca) and a lone white stone (ea), on an otherwise empty 9x9 board.
const board = parseBoard(['bbb1w4', ...Array(8).fill('9')].join('/'), 9);

test('chainAt: every stone of a connected group, none of a separate stone', () => {
  const chain = chainAt(board, 0, 0);
  assert.equal(chain.length, 3);
  const keys = new Set(chain.map(p => `${p.x},${p.y}`));
  assert.deepEqual(keys, new Set(['0,0', '1,0', '2,0']));
});

test('chainAt: empty for an empty point', () => {
  assert.deepEqual(chainAt(board, 8, 8), []);
});

test('widenToChains: one point of a chain widens to the whole chain', () => {
  const widened = widenToChains(board, [{ x: 1, y: 0 }]);
  assert.equal(widened.length, 3);
});

test('widenToChains: two points of two different chains widen to both, each once', () => {
  const widened = widenToChains(board, [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
  ]);
  assert.equal(widened.length, 4); // 3-stone chain + the lone stone
});

test('isWholeChains: true for exactly one whole chain', () => {
  assert.ok(
    isWholeChains(board, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]),
  );
});

test('isWholeChains: false for part of a chain (what a service must reject as an error, ADR 0020 §1)', () => {
  assert.equal(
    isWholeChains(board, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]),
    false,
  );
});

test('isWholeChains: false for a duplicate point', () => {
  assert.equal(
    isWholeChains(board, [
      { x: 4, y: 0 },
      { x: 4, y: 0 },
    ]),
    false,
  );
});

test('isWholeChains: true for the empty set', () => {
  assert.ok(isWholeChains(board, []));
});
