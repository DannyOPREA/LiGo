import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
// Replays every libs/conformance fixture whose `appliesTo` includes "scoring" through the
// `count` path (libs/conformance/README.md's harness contract; docs/rules/spec.md §8). Each such
// fixture already gives a finished position (either `setup.board` or `expect.board`, since a
// scoring fixture's moves are only the two passes that open the phase, R-END-1) and the agreed
// dead stones (`score.dead`), so this harness never replays moves itself — same as the service in
// production (ADR 0020 §1: "the service never replays moves, so it is never a second rules
// engine").
//
// Licence: MIT (LiGo's own code, ADR 0006). Fixtures: licences per libs/conformance/NOTICE.md.
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { formatBoard, type Board } from '../src/board.ts';
import { BLACK, WHITE, EMPTY } from '../src/goban.ts';
import { handle, type CountRequest } from '../src/handle.ts';
import { handicapPoints } from './handicap-points.ts';

const fixturesDir = fileURLToPath(new URL('../../../libs/conformance/fixtures/', import.meta.url));

interface FixtureCase {
  id: string;
  appliesTo: string[];
  size: 9 | 13 | 19;
  ruleset?: 'japanese' | 'chinese';
  handicap?: number;
  komi?: number;
  setup?: { board: string[]; toMove: string };
  expect?: { board?: string[]; captures?: { black: number; white: number } };
  score?: { dead: string[]; black: number; white: number; result: string };
}

function loadScoringCases(): FixtureCase[] {
  const cases: FixtureCase[] = [];
  for (const file of readdirSync(fixturesDir)) {
    if (!file.endsWith('.json')) continue;
    const data = JSON.parse(readFileSync(fixturesDir + file, 'utf-8'));
    for (const c of data.cases as FixtureCase[]) {
      if (c.appliesTo.includes('scoring')) cases.push(c);
    }
  }
  return cases;
}

function parseFixtureBoard(rows: string[]): Board {
  return rows.map(row => row.split('').map(ch => (ch === 'X' ? BLACK : ch === 'O' ? WHITE : EMPTY)));
}

function emptyBoard(size: number): Board {
  return Array.from({ length: size }, () => Array(size).fill(EMPTY));
}

/** The board a scoring fixture describes: its own `setup.board` or `expect.board` when given,
 * else (the two goban.json handicap-4 cases) the standard fixed handicap placement (R-HCP-4) on
 * an otherwise empty board — every scoring fixture's moves are just the two passes that open the
 * phase, so this never has to replay a move. */
function fixtureBoard(c: FixtureCase): Board {
  if (c.setup) return parseFixtureBoard(c.setup.board);
  if (c.expect?.board) return parseFixtureBoard(c.expect.board);
  const handicap = c.handicap ?? 0;
  if (handicap < 2) return emptyBoard(c.size);
  const board = emptyBoard(c.size);
  for (const p of handicapPoints(c.size as 9 | 19, handicap)) {
    const x = p.charCodeAt(0) - 'a'.charCodeAt(0);
    const y = p.charCodeAt(1) - 'a'.charCodeAt(0);
    board[y][x] = BLACK;
  }
  return board;
}

const cases = loadScoringCases();
assert.ok(cases.length > 0, 'expected at least one scoring fixture');

for (const c of cases) {
  test(`scoring fixture: ${c.id}`, async () => {
    assert.ok(c.score, `${c.id}: a scoring fixture must have a score field`);
    assert.ok(c.ruleset, `${c.id}: a scoring fixture must have a ruleset (libs/conformance/README.md)`);
    const board = fixtureBoard(c);
    const captures = c.expect?.captures ?? { black: 0, white: 0 };
    const req: CountRequest = {
      t: 'count',
      ref: c.id,
      size: c.size,
      rules: c.ruleset === 'japanese' ? 'j' : 'c',
      komi: c.komi ?? 0,
      handicap: c.handicap ?? 0,
      board: formatBoard(board),
      prisoners: { b: captures.black, w: captures.white },
      dead: c.score!.dead,
    };
    const reply = await handle(req, { katago: null });
    assert.equal(reply.t, 'count', `${c.id}: ${reply.t === 'error' ? reply.message : ''}`);
    if (reply.t !== 'count') return;
    assert.equal(reply.score.b.total, c.score!.black, `${c.id}: black total`);
    assert.equal(reply.score.w.total, c.score!.white, `${c.id}: white total`);
  });
}
