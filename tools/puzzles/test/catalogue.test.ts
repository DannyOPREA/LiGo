// The catalogue and the wall check (ADR 0025 §2): positions are built as drawn, and the check
// rejects every position the solver can't judge soundly.
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { SHAPES, build, layout, reject, variations } from '../src/catalogue.ts';
import { BLACK, WHITE } from '../src/goban.ts';
import { parseDiagram, place } from '../src/position.ts';

const shape = (name: string) => SHAPES.find(s => s.name === name)!;

test('a straight three in the corner: its space, the ring and the wall', () => {
  const l = layout(shape('straight three'), 'corner');
  assert.deepEqual(l.eye, [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 2, y: 0 },
  ]);
  assert.deepEqual(l.ring, [
    { x: 3, y: 0 },
    { x: 0, y: 1 },
    { x: 1, y: 1 },
    { x: 2, y: 1 },
    { x: 3, y: 1 },
  ]);
  assert.equal(l.wall.length, 7);
  const pos = build(l, { gaps: [], inside: [] }, BLACK);
  assert.equal(reject(pos), null);
  assert.equal(pos.black.length, 5);
  assert.equal(pos.white.length, 7);
});

test('every catalogue shape is well formed and has usable variations', () => {
  for (const s of SHAPES) {
    for (const a of s.anchors) {
      const l = layout(s, a);
      const usable = variations(l).filter(v => reject(build(l, v, WHITE)) === null);
      assert.ok(usable.length > 10, `${s.name} ${a}: ${usable.length} usable variations`);
    }
  }
});

test('the wall check', () => {
  const check = (d: string) => reject(place(parseDiagram(d), 19, BLACK));
  // Sound: the wall has plenty of liberties outside.
  assert.equal(check('. . . X O -\nX X X X O -\nO O O O O -\n- - - - - -'), null);
  // The defender can run out through an empty point outside the region.
  assert.equal(check('. . . X O -\nX X X X - -\nO O O O O -\n- - - - - -'), 'defender can escape');
  // An attacker stone inside the region may be short of liberties: it can be captured.
  assert.equal(check('. o . X O -\nX X X X O -\nO O O O O -\n- - - - - -'), null);
  // A wall stone next to the region, but with no liberty outside it.
  assert.equal(check('. . O X O -\nX X X X O -\nO O O O O -\n- - - - - -'), 'wall not safe');
  // A wall stone touching the region with one liberty outside it.
  assert.equal(check('. . . O - -\nX X X X O -\nO O O O O -\n- - - - - -'), 'wall not safe');
  // A chain without liberties.
  assert.equal(check('. . . X O X\nX X X X O X\nO O O O O X\nX X X X X X'), 'no liberties');
  // The defender in two pieces.
  assert.equal(check('. . . X O -\nX X . X O -\nO O O O O -\n- - - - - -'), 'defender in pieces');
  // Too many empty points for the solver.
  assert.equal(check('. . . . . . X O\n. . . . . X X O\nX X X X X X O -\nO O O O O O O -'), 'region too big');
});
