// The generator end to end with a stand-in for KataGo: the same seed makes the same puzzles, every
// puzzle passes `check`, and a KataGo disagreement drops the puzzle.
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { difficulty, generate, idOf } from '../src/generate.ts';
import { check } from '../src/puzzle.ts';
import type { Built } from '../src/tree.ts';

const info = { version: 'stand-in', network: 'none', sha256: '0'.repeat(64), visits: 1 };
const agree = { info, check: async () => null };
const limits = { maxDepth: 30, maxNodes: 2_000_000, maxMs: 2_000 };

test('the same seed makes the same puzzles, and each passes check', async () => {
  const a = await generate({ seed: 7, count: 4, katago: agree, solverLimits: limits });
  const b = await generate({ seed: 7, count: 4, katago: agree, solverLimits: limits });
  assert.equal(a.puzzles.length, 4);
  assert.deepEqual(
    a.puzzles.map(p => p.id),
    b.puzzles.map(p => p.id),
  );
  assert.deepEqual(a.puzzles, b.puzzles);
  for (const p of a.puzzles) {
    assert.deepEqual(check(p), [], p.id);
    assert.equal(p.provenance.source, 'generated');
    assert.ok(p.themes.includes(p.goal === 'live' ? 'living' : 'killing'));
  }
  const c = await generate({ seed: 8, count: 4, katago: agree, solverLimits: limits });
  assert.notDeepEqual(
    c.puzzles.map(p => p.id),
    a.puzzles.map(p => p.id),
  );
});

test('a KataGo disagreement drops the puzzle', async () => {
  const { puzzles, tally } = await generate({
    seed: 7,
    count: 2,
    maxTried: 40,
    katago: { info, check: async () => 'disagrees' },
    solverLimits: limits,
  });
  assert.equal(puzzles.length, 0);
  assert.ok((tally.dropped['KataGo disagrees'] ?? 0) > 0);
});

test('difficulty: longer lines and harder searches rate higher, within the bands', () => {
  const built = (depth: number, solverNodes: number, wrongFirstMoves: number) =>
    ({ depth, solverNodes, wrongFirstMoves }) as Built;
  const easy = difficulty(built(1, 10, 1));
  const hard = difficulty(built(7, 100_000, 6));
  assert.ok(easy.rating < hard.rating);
  assert.ok(easy.rating >= 650 && easy.rating <= 950, `${easy.rating}`);
  assert.ok(hard.rating >= 1850 && hard.rating <= 2150, `${hard.rating}`);
});

test('ids are 5 characters of base 62', () => {
  assert.match(idOf('anything'), /^[0-9A-Za-z]{5}$/);
  assert.notEqual(idOf('a'), idOf('b'));
});
