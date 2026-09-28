import assert from 'node:assert/strict';
// Unit tests for src/bench.ts's own logic (unit 4.6): argument parsing and the ground-truth
// comparison, not the real-KataGo bench run itself (that needs KataGo installed and is exercised
// by hand via `dev/ligo scoring bench`, not in this suite).
//
// Licence: MIT (LiGo's own code, ADR 0006).
import { test } from 'node:test';

import { cellChar, compareToGroundTruth, loadBoard, parseArgs } from '../src/bench.ts';
import { BLACK, EMPTY, WHITE } from '../src/goban.ts';

test('parseArgs: defaults', () => {
  const a = parseArgs([]);
  assert.equal(a.timeoutMs, 60_000);
  assert.equal(a.komiJapanese, 6.5);
  assert.equal(a.komiChinese, 7.5);
  assert.equal(a.gate, undefined);
  assert.ok(a.games.endsWith('autoscore_test_files/'), a.games);
});

test('parseArgs: reads every flag', () => {
  const a = parseArgs([
    '--net',
    '/tmp/net.bin.gz',
    '--bin',
    '/tmp/katago',
    '--config',
    '/tmp/cfg.cfg',
    '--games',
    '/tmp/games',
    '--gate',
    '97',
    '--limit',
    '5',
    '--timeout',
    '90000',
    '--out',
    '/tmp/out.json',
    '--komi-japanese',
    '6',
    '--komi-chinese',
    '7',
  ]);
  assert.equal(a.net, '/tmp/net.bin.gz');
  assert.equal(a.bin, '/tmp/katago');
  assert.equal(a.config, '/tmp/cfg.cfg');
  assert.equal(a.games, '/tmp/games');
  assert.equal(a.gate, 97);
  assert.equal(a.limit, 5);
  assert.equal(a.timeoutMs, 90000);
  assert.equal(a.out, '/tmp/out.json');
  assert.equal(a.komiJapanese, 6);
  assert.equal(a.komiChinese, 7);
});

test("parseArgs: tolerates pnpm's own leading '--' wherever it appears", () => {
  const a = parseArgs(['--', '--limit', '1', '--', '--gate', '90']);
  assert.equal(a.limit, 1);
  assert.equal(a.gate, 90);
});

test('parseArgs: rejects an unknown flag', () => {
  assert.throws(() => parseArgs(['--nope']), /unknown argument/);
});

test('parseArgs: rejects a flag missing its value', () => {
  assert.throws(() => parseArgs(['--net']), /needs a value/);
});

test('loadBoard: b/w/W/space, everything else empty', () => {
  const board = loadBoard(['bwW ', ' bw ']);
  assert.deepEqual(board, [
    [BLACK, WHITE, WHITE, EMPTY],
    [EMPTY, BLACK, WHITE, EMPTY],
  ]);
});

test('cellChar', () => {
  assert.equal(cellChar(BLACK), 'B');
  assert.equal(cellChar(WHITE), 'W');
  assert.equal(cellChar(EMPTY), ' ');
});

test('compareToGroundTruth: a perfect match has no mismatches', () => {
  // owner: 'b.' / '.w' (row-major, one char per point)
  const { ok, mismatches } = compareToGroundTruth('b..w', 2, new Set(), ['B ', ' W']);
  assert.ok(ok);
  assert.deepEqual(mismatches, []);
});

test('compareToGroundTruth: a wildcard "*" matches anything', () => {
  const { ok } = compareToGroundTruth('bw..', 2, new Set(), ['**', '**']);
  assert.ok(ok);
});

test('compareToGroundTruth: a mismatch is reported with its point and both values', () => {
  const { ok, mismatches } = compareToGroundTruth('b...', 2, new Set(), [' W', '**']);
  assert.equal(ok, false);
  assert.equal(mismatches.length, 2);
  assert.match(mismatches[0], /\(0,0\) got 'B' want ' '/);
  assert.match(mismatches[1], /\(1,0\) got ' ' want 'W'/);
});

test("compareToGroundTruth: 's' only matches a point this run also flagged as needing sealing", () => {
  const sealed = compareToGroundTruth('....', 2, new Set(['0,0']), ['s ', '**']);
  assert.ok(sealed.ok);
  const unsealed = compareToGroundTruth('....', 2, new Set(), ['s ', '**']);
  assert.equal(unsealed.ok, false);
  assert.match(unsealed.mismatches[0], /\(0,0\)/);
});
