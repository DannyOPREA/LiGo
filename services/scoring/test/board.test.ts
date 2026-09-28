import assert from 'node:assert/strict';
// Board string parsing/serialization and point encoding (ADR 0019 §6, ADR 0020 §1).
//
// Licence: MIT (LiGo's own code, ADR 0006).
import { test } from 'node:test';

import { parseBoard, formatBoard, initialState, parsePoints, formatPoints } from '../src/board.ts';
import { BLACK, WHITE, EMPTY } from '../src/goban.ts';

test('parseBoard: an empty 9x9 board', () => {
  const board = parseBoard(Array(9).fill('9').join('/'), 9);
  assert.equal(board.length, 9);
  for (const row of board) assert.deepEqual(row, Array(9).fill(EMPTY));
});

test("parseBoard: a run of empty points longer than 9 (unlike a chess FEN's single digit)", () => {
  const board = parseBoard(Array(19).fill('19').join('/'), 19);
  assert.equal(board[0].length, 19);
  assert.deepEqual(board[0], Array(19).fill(EMPTY));
});

test('parseBoard: stones and runs mixed in one row', () => {
  const board = parseBoard(['b7w', ...Array(8).fill('9')].join('/'), 9);
  assert.deepEqual(board[0], [BLACK, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, WHITE]);
});

test('parseBoard: rejects the wrong number of rows', () => {
  assert.throws(() => parseBoard(Array(8).fill('9').join('/'), 9), /8 rows, expected 9/);
});

test("parseBoard: rejects a row whose points don't add up to size", () => {
  assert.throws(() => parseBoard(['b7', ...Array(8).fill('9')].join('/'), 9), /8 points/);
});

test('parseBoard: rejects an unknown character', () => {
  assert.throws(() => parseBoard(['b6xw', ...Array(8).fill('9')].join('/'), 9), /invalid character/);
});

// B4 (logs/scoring.md "4.4 review fixes"): the protocol is lowercase only (ADR 0019 §6).
test('parseBoard: rejects uppercase B/W', () => {
  assert.throws(() => parseBoard(['B8', ...Array(8).fill('9')].join('/'), 9), /invalid character/);
  assert.throws(() => parseBoard(['W8', ...Array(8).fill('9')].join('/'), 9), /invalid character/);
});

test('parseBoard: rejects a run with a leading zero', () => {
  assert.throws(() => parseBoard(['b07', ...Array(8).fill('9')].join('/'), 9), /leading zero/);
  assert.throws(() => parseBoard(['b0', ...Array(8).fill('9')].join('/'), 9), /leading zero/);
});

test('parseBoard: rejects a run longer than the board, before expanding it', () => {
  assert.throws(() => parseBoard(['99', ...Array(8).fill('9')].join('/'), 9), /longer than the board/);
});

test("formatBoard is parseBoard's inverse", () => {
  const compact = ['b7w', '2bw5', ...Array(7).fill('9')].join('/');
  const board = parseBoard(compact, 9);
  assert.equal(formatBoard(board), compact);
});

test('initialState: SGF points for every stone, none for empty points', () => {
  const board = parseBoard(['b7w', ...Array(8).fill('9')].join('/'), 9);
  assert.deepEqual(initialState(board), { black: 'aa', white: 'ia' });
});

test("parsePoints/formatPoints: SGF coordinates round-trip, 'i' included (spec §2)", () => {
  const points = parsePoints(['aa', 'ss', 'ii', 'pd']);
  assert.deepEqual(points, [
    { x: 0, y: 0 },
    { x: 18, y: 18 },
    { x: 8, y: 8 },
    { x: 15, y: 3 },
  ]);
  assert.deepEqual(formatPoints(points), ['aa', 'ss', 'ii', 'pd']);
});

test('parsePoints: rejects a malformed point', () => {
  assert.throws(() => parsePoints(['a']), /invalid point/);
});
