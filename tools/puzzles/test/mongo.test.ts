// `dev/ligo puzzles load` (ADR 0025 §5, unit 8.6): mongo/doc.js turns a data file's puzzle into
// lila's puzzle document. The file decides the board and the tree; play decides the rating, plays,
// votes and themes, so a second load never resets them. The load itself runs against a real Mongo
// only on a developer's box (`dev/ligo puzzles load`, "Needs your verification").
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { DATA_DIR, readPuzzles } from '../src/cli.ts';
import type { Puzzle } from '../src/puzzle.ts';

type Doc = { set: Record<string, unknown>; setOnInsert: Record<string, unknown> };
const source = readFileSync(new URL('../mongo/doc.js', import.meta.url), 'utf8');
const puzzleDoc = new Function(`${source}\nreturn puzzleDoc;`)() as (p: Puzzle) => Doc;
const puzzles = readPuzzles(`${DATA_DIR}generated-001.json`);

test("a puzzle becomes ADR 0025's document: the board and tree set, play's fields on insert only", () => {
  const p = puzzles[0]!;
  const d = puzzleDoc(p);
  assert.deepEqual(d.set, {
    size: p.width,
    bounds: p.bounds,
    setup: p.initial_state,
    player: p.initial_player,
    tree: p.move_tree,
    goal: p.goal,
    prov: p.provenance,
  });
  assert.deepEqual(d.setOnInsert, {
    glicko: { r: p.rating, d: 500, v: 0.09 },
    plays: 0,
    vote: 0,
    vu: 0,
    vd: 0,
    themes: p.themes,
  });
});

test('the tree is passed on untouched', () => {
  for (const p of puzzles) assert.equal(puzzleDoc(p).set.tree, p.move_tree);
});

test('a puzzle without bounds has no bounds field', () => {
  const { bounds: _, ...whole } = puzzles[0]!;
  assert.equal('bounds' in puzzleDoc(whole as Puzzle).set, false);
});

test('every committed puzzle maps to a square board lila accepts', () => {
  for (const p of puzzles) {
    assert.equal(p.width, p.height, p.id);
    assert.ok([9, 13, 19].includes(puzzleDoc(p).set.size as number), p.id);
    assert.match(p.id, /^[A-Za-z0-9]{5}$/);
  }
});
