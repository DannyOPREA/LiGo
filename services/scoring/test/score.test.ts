import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// score.ts: proposeFromOwnership (the autoscore → widenToChains → countGiven pipeline, ADR 0020
// §1) and countGiven's rules-dependent prisoners (R-SCORE-J1, R-SCORE-C1). Review findings for
// unit 4.4 (logs/scoring.md "4.4 review fixes"): B1, autoscore mutates the board it's given, so a
// caller that widens or counts against the same array sees an already-blanked board and finds
// nothing dead; B2, play prisoners must not be added under Chinese rules.
//
// Licence: MIT (LiGo's own code, ADR 0006). Test data: Apache-2.0 (test/autoscore_test_files/NOTICE.md).
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { formatBoard, type Board } from '../src/board.ts';
import { widenToChains } from '../src/chains.ts';
import { autoscore, BLACK, EMPTY, WHITE } from '../src/goban.ts';
import { countGiven, proposeFromOwnership, type Ruleset } from '../src/score.ts';

const dir = fileURLToPath(new URL('./autoscore_test_files/', import.meta.url));

function loadGame(file: string): { board: Board; rules: Ruleset; black: number[][]; white: number[][] } {
  const data = JSON.parse(readFileSync(dir + file, 'utf-8'));
  const board: Board = data.board.map((row: string) =>
    row.split('').map((cell: string) => {
      if (cell === 'w' || cell === 'W') return WHITE;
      if (cell === 'b' || cell === 'B') return BLACK;
      return EMPTY;
    }),
  );
  const rules: Ruleset = (data.rules ?? 'chinese') === 'japanese' ? 'j' : 'c';
  return { board, rules, black: data.black, white: data.white };
}

// game_33822914.json (9x9, Chinese): OGS's own ownership maps mark stones dead.
test('proposeFromOwnership: a vendored OGS game (9x9, Chinese) proposes its dead stones', () => {
  const { board, rules, black, white } = loadGame('game_33822914.json');
  const before = formatBoard(board);
  const r = proposeFromOwnership(board, rules, { blackToMove: black, whiteToMove: white }, 7.5, 0, {
    b: 0,
    w: 0,
  });
  assert.equal(formatBoard(board), before, 'proposeFromOwnership must not mutate the board it was given');
  assert.ok(r.dead.length > 0, 'expected at least one dead stone on this game');
});

// game_seki_64848549.json (19x19, Japanese): a bigger game with several dead stones.
test('proposeFromOwnership: a second vendored OGS game (19x19, Japanese) proposes its dead stones', () => {
  const { board, rules, black, white } = loadGame('game_seki_64848549.json');
  const before = formatBoard(board);
  const r = proposeFromOwnership(board, rules, { blackToMove: black, whiteToMove: white }, 7.5, 0, {
    b: 0,
    w: 0,
  });
  assert.equal(formatBoard(board), before, 'proposeFromOwnership must not mutate the board it was given');
  assert.ok(r.dead.length > 0, 'expected at least one dead stone on this game');
});

test('proposeFromOwnership: dead is exactly widenToChains(board, autoscore.removed)', () => {
  const { board, rules, black, white } = loadGame('game_33822914.json');
  // Reproduce what autoscore itself would find, but against a copy (as score.ts now does),
  // so this assertion doesn't fall prey to the same mutation bug it's guarding against.
  const [res] = autoscore(
    board.map(row => row.slice()),
    rules === 'j' ? 'japanese' : 'chinese',
    black,
    white,
  );
  const widened = widenToChains(board, res.removed);
  const r = proposeFromOwnership(board, rules, { blackToMove: black, whiteToMove: white }, 7.5, 0, {
    b: 0,
    w: 0,
  });
  const widenedKeys = new Set(widened.map(p => `${p.x},${p.y}`)).size;
  assert.equal(r.dead.length, widenedKeys);
});

test('countGiven: Japanese prisoners include the play prisoners lila reports', () => {
  const { board } = loadGame('game_seki_64848549.json');
  const withoutPlay = countGiven(board, 'j', 7.5, 0, [], { b: 0, w: 0 });
  const withPlay = countGiven(board, 'j', 7.5, 0, [], { b: 4, w: 2 });
  assert.equal(withPlay.score.b.prisoners, withoutPlay.score.b.prisoners + 4);
  assert.equal(withPlay.score.w.prisoners, withoutPlay.score.w.prisoners + 2);
  assert.equal(withPlay.score.b.total, withoutPlay.score.b.total + 4);
  assert.equal(withPlay.score.w.total, withoutPlay.score.w.total + 2);
});

test('countGiven: Chinese scoring never adds play prisoners (R-SCORE-C1)', () => {
  const { board } = loadGame('game_33822914.json');
  const withoutPlay = countGiven(board, 'c', 7.5, 0, [], { b: 0, w: 0 });
  const withPlay = countGiven(board, 'c', 7.5, 0, [], { b: 4, w: 2 });
  assert.deepEqual(withPlay.score, withoutPlay.score);
});
