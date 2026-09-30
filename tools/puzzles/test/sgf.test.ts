// Puzzles to SGF and back: toSgf's output, read by libs/board's SGF reader (unit 7.2) through
// fromSgf, gives the same puzzle.
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { check } from '../src/puzzle.ts';
import { fromSgf, toSgf } from '../src/sgf.ts';
import { straightThree } from './helpers.ts';

const meta = {
  id: 'cls01',
  bounds: { top: 0, left: 0, bottom: 4, right: 6 },
  goal: 'live' as const,
  themes: ['lifeAndDeath' as const],
  rating: 1600,
  provenance: {
    source: 'transcribed' as const,
    work: 'Gokyō Shumyō',
    edition: 'test edition',
    problem: '1',
    scan_url: 'https://example.org/scan',
    page: '1',
    rights: 'test',
    transcriber: 'test',
    checker: 'test',
  },
};

test('toSgf writes the setup, the player and RIGHT/WRONG comments', () => {
  const sgf = toSgf(straightThree());
  assert.match(sgf, /^\(;GM\[1\]FF\[4\]CA\[UTF-8\]AP\[LiGo puzzles\]SZ\[19\]PL\[B\]AB/);
  assert.match(sgf, /\(;B\[ba\]C\[RIGHT\]\)/);
  assert.match(sgf, /\(;B\[aa\];W\[ba\]C\[WRONG\]\)/);
});

test('an SGF written by toSgf reads back as the same puzzle', () => {
  const original = straightThree();
  const back = fromSgf(toSgf(original), meta);
  assert.deepEqual(back.move_tree, original.move_tree);
  assert.deepEqual(back.initial_state, original.initial_state);
  assert.equal(back.initial_player, 'black');
  assert.deepEqual(check(back), []);
});

test('a transcribed problem: RIGHT marks the right lines, anything else is wrong', () => {
  const sgf =
    '(;SZ[9]PL[W]AB[ca][cb][bc][ac]AW[da][db][dc][cc][bd][ad](;W[ab];B[aa]C[a note\nRIGHT])(;W[aa];B[ab]))';
  const p = fromSgf(sgf, { ...meta, bounds: { top: 0, left: 0, bottom: 4, right: 4 } });
  assert.equal(p.width, 9);
  assert.equal(p.initial_player, 'white');
  assert.deepEqual(p.move_tree.branches, [
    { x: 0, y: 1, branches: [{ x: 0, y: 0, text: 'a note', correct_answer: true }] },
    { x: 0, y: 0, branches: [{ x: 0, y: 1, wrong_answer: true }] },
  ]);
});

test('a transcribed problem with a pass is refused', () => {
  assert.throws(() => fromSgf('(;SZ[9]AB[aa]AW[ba];B[])', meta), /a pass/);
});
