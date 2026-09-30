// `check` (src/puzzle.ts): a good puzzle passes; every broken case is rejected with its reason
// (PLAN unit 8.3: illegal moves, suicide, no right answer, and the schema).
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { check, type Puzzle } from '../src/puzzle.ts';
import { straightThree } from './helpers.ts';

const broken = (change: (p: Puzzle) => void): string[] => {
  const p = structuredClone(straightThree());
  change(p);
  return check(p);
};

test('a good puzzle passes', () => {
  assert.deepEqual(check(straightThree()), []);
});

test('the schema: missing and unknown fields, bad values', () => {
  assert.match(broken(p => delete (p as Partial<Puzzle>).provenance).join(), /provenance/);
  assert.match(broken(p => Object.assign(p, { colour: 'red' })).join(), /additional/);
  assert.match(broken(p => (p.id = 'toolongid')).join(), /pattern/);
  assert.match(broken(p => (p.themes = ['mate' as never])).join(), /allowed values/);
  assert.match(broken(p => (p.puzzle_opponent_move_mode = 'manual' as never)).join(), /constant/);
});

test('the board and the setup', () => {
  assert.deepEqual(
    broken(p => (p.bounds.bottom = 30)),
    ['/bounds/bottom must be <= 18'],
  );
  assert.deepEqual(
    broken(p => (p.bounds.top = 9)),
    ['bounds outside the board'],
  );
  assert.deepEqual(
    broken(p => (p.initial_state.white += 'da')),
    ['two setup stones on 3,0'],
  );
  assert.deepEqual(
    broken(p => {
      p.initial_state.white += 'aa';
      p.initial_state.black += 'ba';
    }),
    ['setup stones at 0,0 have no liberties'],
  );
});

test('an illegal move in the tree', () => {
  // A stone on a setup stone.
  assert.match(
    broken(p => p.move_tree.branches!.push({ x: 3, y: 0, wrong_answer: true })).join(),
    /illegal \(occupied\)/,
  );
});

test('a suicide in the tree', () => {
  // White's stone at 0,0 after Black 1,0 (the right move) has no liberties: suicide.
  const errors = broken(p => {
    const right = p.move_tree.branches!.find(b => b.correct_answer)!;
    delete right.correct_answer;
    right.branches = [{ x: 0, y: 0, branches: [{ x: 2, y: 0, correct_answer: true }] }];
  });
  assert.match(errors.join(), /0,0: illegal \(suicide\)/);
});

test('no right answer, and lines that end without saying', () => {
  assert.deepEqual(
    broken(p => (p.move_tree.branches = p.move_tree.branches!.filter(b => !b.correct_answer))),
    ['no right answer'],
  );
  assert.match(
    broken(p => delete p.move_tree.branches!.find(b => b.correct_answer)!.correct_answer).join(),
    /ends without saying right or wrong/,
  );
  assert.match(broken(p => (p.move_tree.branches![0].wrong_answer = true)).join(), /both right and wrong/);
});

test('a right answer after the opponent moves, and a line going on after its end', () => {
  const errors = broken(p => {
    const wrong = p.move_tree.branches!.find(b => !b.correct_answer)!;
    wrong.branches = [{ x: 1, y: 0, correct_answer: true }];
  });
  assert.match(errors.join(), /a right answer after the opponent's move/);
  const more = broken(p => {
    p.move_tree.branches!.find(b => b.correct_answer)!.branches = [{ x: 0, y: 0, wrong_answer: true }];
  });
  assert.match(more.join(), /goes on after right or wrong/);
});

test('moves outside the bounds, and the same move twice', () => {
  assert.match(broken(p => (p.bounds.right = 1)).join(), /2,0: outside the bounds/);
  assert.match(
    broken(p => p.move_tree.branches!.push({ x: 1, y: 0, wrong_answer: true })).join(),
    /the same move twice/,
  );
});
