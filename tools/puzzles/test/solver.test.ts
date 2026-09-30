// Known answers for the solver and the puzzle tree (ADR 0025 §2, unit 8.3).
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { BLACK, WHITE } from '../src/goban.ts';
import { parseDiagram, place } from '../src/position.ts';
import { Solver } from '../src/solver.ts';
import { buildPuzzle } from '../src/tree.ts';

// Straight three in the corner: the middle point lives for the defender and kills for the attacker.
const STRAIGHT_THREE = parseDiagram(`
  . . . X O -
  X X X X O -
  O O O O O -
  - - - - - -
`);

test('straight three: only the middle point lives', () => {
  const s = new Solver(place(STRAIGHT_THREE, 9, BLACK), BLACK);
  s.startClock();
  assert.equal(s.valueAfter({ x: 1, y: 0 }), 'defender');
  assert.equal(s.valueAfter({ x: 0, y: 0 }), 'attacker');
  assert.equal(s.valueAfter({ x: 2, y: 0 }), 'attacker');
  assert.equal(s.solve(), 'defender');
});

test('straight three: only the middle point kills', () => {
  const s = new Solver(place(STRAIGHT_THREE, 9, BLACK), WHITE);
  s.startClock();
  assert.equal(s.valueAfter({ x: 1, y: 0 }), 'attacker');
  assert.equal(s.valueAfter({ x: 0, y: 0 }), 'defender');
  assert.equal(s.valueAfter({ x: 2, y: 0 }), 'defender');
});

test('straight three: the same answers in every corner and colour', () => {
  for (let o = 0; o < 8; o++) {
    for (const defender of [BLACK, WHITE] as const) {
      assert.equal(new Solver(place(STRAIGHT_THREE, 9, defender, o), defender).solve(), 'defender');
      const attacker = defender === BLACK ? WHITE : BLACK;
      assert.equal(new Solver(place(STRAIGHT_THREE, 9, defender, o), attacker).solve(), 'attacker');
    }
  }
});

test('straight three: the puzzle tree to live', () => {
  const b = buildPuzzle(place(STRAIGHT_THREE, 9, BLACK), BLACK);
  assert.equal(b.goal, 'live');
  assert.equal(b.rightFirstMoves, 1);
  const right = b.tree.branches!.filter(n => n.correct_answer || n.branches?.some(r => !r.wrong_answer));
  assert.deepEqual(
    right.map(n => [n.x, n.y]),
    [[1, 0]],
  );
  assert.equal(right[0].correct_answer, true);
  const wrong = b.tree.branches!.filter(n => n !== right[0]);
  assert.equal(wrong.length, 2);
  for (const w of wrong) assert.equal(w.branches?.[0].wrong_answer, true);
});

test('straight three: the puzzle tree to kill', () => {
  const b = buildPuzzle(place(STRAIGHT_THREE, 9, BLACK), WHITE);
  assert.equal(b.goal, 'kill');
  assert.equal(b.rightFirstMoves, 1);
  assert.deepEqual(b.tree.branches![0], { x: 1, y: 0, correct_answer: true });
});

// A rabbity six with one of the attacker's stones inside: the attacker kills at the vital point in
// the middle, and the defender's reply needs an answer, so the right line is three moves long.
const RABBITY_SIX = parseDiagram(`
  - - - - - - - - -
  - - O O O O O O -
  - O O X X X X O -
  - O X X . . X O -
  - O X o . . X O -
  - O X X . X X O -
  - O O X X X O O -
  - - O O O O O - -
  - - - - - - - - -
`);

test('rabbity six: the vital point kills, and the line goes on until it is settled', () => {
  const b = buildPuzzle(place(RABBITY_SIX, 19, BLACK), WHITE);
  assert.equal(b.goal, 'kill');
  assert.equal(b.rightFirstMoves, 1);
  assert.equal(b.depth, 3);
  const right = b.tree.branches!.find(n => !n.wrong_answer && !n.branches?.every(r => r.wrong_answer))!;
  assert.deepEqual([right.x, right.y], [4, 4]);
  assert.equal(right.correct_answer, undefined, 'the vital point alone does not settle it');
  // Black's most resisting replies, each with every answer that kills.
  const replies = Object.fromEntries(
    right.branches!.map(r => [`${r.x},${r.y}`, r.branches!.map(a => `${a.x},${a.y}`).sort()]),
  );
  assert.deepEqual(replies, { '5,3': ['4,3', '4,5', '5,4'], '4,3': ['5,4'], '5,4': ['4,3'] });
  for (const r of right.branches!) for (const a of r.branches!) assert.equal(a.correct_answer, true);
  // Every other first move is refuted by Black taking the vital point.
  for (const w of b.tree.branches!.filter(n => n !== right))
    assert.deepEqual(w.branches, [{ x: 4, y: 4, wrong_answer: true }]);
});
