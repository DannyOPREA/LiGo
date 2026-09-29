import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
// Unit tests for src/bench.ts and src/grade.ts (unit 4.6): argument parsing, the grader, and the
// key check of the review fix B1: the bench's grader run on OGS's *stored* ownership maps gives
// 31/31, so a shortfall in a live run is KataGo's, not the grader's. The real-KataGo bench run is
// exercised by hand (`dev/ligo scoring bench`).
//
// Licence: MIT (LiGo's own code, ADR 0006). Test data: Apache-2.0 (test/autoscore_test_files/NOTICE.md).
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { gradeGame, loadBoard, parseArgs, type GameFile } from '../src/bench.ts';
import { BLACK, EMPTY, WHITE } from '../src/goban.ts';
import { cellChar, deadSetAgrees, ownershipMismatches } from '../src/grade.ts';

test('parseArgs: defaults', () => {
  const a = parseArgs([]);
  assert.equal(a.timeoutMs, 60_000);
  assert.equal(a.komi, 7.5);
  assert.equal(a.runs, 3);
  assert.equal(a.gate, undefined);
  assert.ok(a.games.endsWith('autoscore_test_files/'), a.games);
});

test('parseArgs: reads every flag', () => {
  const a = parseArgs(
    '--net /n --bin /b --config /c --games /g --gate 97 --runs 2 --limit 5 --timeout 90000 --out /o --komi 6.5'.split(
      ' ',
    ),
  );
  assert.deepEqual(
    [a.net, a.bin, a.config, a.games, a.gate, a.runs, a.limit, a.timeoutMs, a.out, a.komi],
    ['/n', '/b', '/c', '/g', 97, 2, 5, 90000, '/o', 6.5],
  );
});

test("parseArgs: tolerates pnpm's own '--' wherever it appears", () => {
  const a = parseArgs(['--', '--limit', '1', '--', '--gate', '90']);
  assert.equal(a.limit, 1);
  assert.equal(a.gate, 90);
});

test('parseArgs: rejects unknown flags and missing values', () => {
  assert.throws(() => parseArgs(['--nope']), /unknown argument/);
  assert.throws(() => parseArgs(['--net']), /needs a value/);
});

test('parseArgs: rejects non-finite or invalid numbers', () => {
  for (const flag of ['--gate', '--limit', '--timeout', '--runs', '--komi']) {
    assert.throws(() => parseArgs([flag, 'abc']), /finite number/, flag);
    assert.throws(() => parseArgs([flag, 'Infinity']), /finite number/, flag);
    assert.throws(() => parseArgs([flag, '']), /finite number/, flag);
  }
  assert.throws(() => parseArgs(['--runs', '0']), /at least 1/);
  assert.throws(() => parseArgs(['--runs', '1.5']), /at least 1/);
});

test('loadBoard and cellChar', () => {
  assert.deepEqual(loadBoard(['bwW ']), [[BLACK, WHITE, WHITE, EMPTY]]);
  assert.deepEqual([BLACK, WHITE, EMPTY].map(cellChar), ['B', 'W', ' ']);
});

test('ownershipMismatches: perfect match, wildcard, mismatch report', () => {
  const grid = [
    [BLACK, EMPTY],
    [EMPTY, WHITE],
  ];
  assert.deepEqual(ownershipMismatches(grid, [], ['B ', ' W']), []);
  assert.deepEqual(ownershipMismatches(grid, [], ['**', '**']), []);
  const m = ownershipMismatches(grid, [], [' W', '**']);
  assert.equal(m.length, 2);
  assert.match(m[0], /\(0,0\) got 'B' want ' '/);
});

test("ownershipMismatches: 's' needs a flagged point, and a flagged point needs 's' or '*'", () => {
  const grid = [[EMPTY, EMPTY]];
  assert.deepEqual(ownershipMismatches(grid, [{ x: 0, y: 0 }], ['s ']), []);
  assert.equal(ownershipMismatches(grid, [], ['s ']).length, 1);
  // the reverse check: flagged (1,0) but the file says ' '
  const rev = ownershipMismatches(grid, [{ x: 1, y: 0 }], ['* ']);
  assert.match(rev.join(), /flagged as needing sealing but want ' '/);
  assert.deepEqual(ownershipMismatches(grid, [{ x: 1, y: 0 }], ['**']), []);
});

test('deadSetAgrees: opposite-colour ownership means dead, own colour means alive', () => {
  const board = [[BLACK, WHITE]];
  assert.ok(deadSetAgrees(board, [{ x: 1, y: 0 }], ['BB']));
  assert.ok(!deadSetAgrees(board, [], ['BB']));
  assert.ok(deadSetAgrees(board, [], ['BW']));
  assert.ok(deadSetAgrees(board, [], ['* ']));
});

const dir = fileURLToPath(new URL('./autoscore_test_files/', import.meta.url));
test("gradeGame on OGS's stored ownership maps grades all 31 games correct", () => {
  const files = readdirSync(dir).filter(f => f.endsWith('.json'));
  assert.equal(files.length, 31);
  const failed: string[] = [];
  for (const f of files) {
    const data = JSON.parse(readFileSync(dir + f, 'utf-8')) as GameFile;
    const g = gradeGame(data, { blackToMove: data.black!, whiteToMove: data.white! }, 7.5);
    if (!g.ok) failed.push(`${f}: ${g.mismatches.slice(0, 3).join('; ')}`);
  }
  assert.deepEqual(failed, []);
});
