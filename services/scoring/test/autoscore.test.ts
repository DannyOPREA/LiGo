import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
// OGS's own autoscore regression set (docs/build-vs-buy/scoring.md point 1, ADR 0016): running
// `autoscore` on OGS's 31 stored ownership maps must reproduce all 31 expected results, exactly
// as goban's own `test/test_autoscore.ts` checks them (its pass rule is reproduced below so this
// package needs no dependency on goban's `test/` sources, only the vendored data files).
//
// Licence: MIT (LiGo's own code, ADR 0006). Test data: Apache-2.0 (test/autoscore_test_files/NOTICE.md).
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { autoscore, BLACK, WHITE, EMPTY, type JGOFMove } from '../src/goban.ts';

const dir = fileURLToPath(new URL('./autoscore_test_files/', import.meta.url));
const files = readdirSync(dir).filter(f => f.endsWith('.json'));

assert.equal(files.length, 31, "expected all 31 of OGS's autoscore test games to be vendored");

interface Cell {
  x: number;
  y: number;
}
function toKey(p: Cell): string {
  return `${p.x},${p.y}`;
}

// goban's test/test_autoscore.ts's `test_result`, reproduced: '*' matches anything, 's' matches
// only a point autoscore also flagged as needing sealing, ' '/'B'/'W' match empty/black/white.
function matchesOwnership(result: number[][], needsSealing: JGOFMove[], correctOwnership: string[]): boolean {
  const sealing = new Set(needsSealing.map(toKey));
  let ok = true;
  for (let y = 0; y < result.length; y += 1) {
    for (let x = 0; x < result[0].length; x += 1) {
      const v = result[y][x];
      const c = correctOwnership[y][x];
      let m =
        c === '*' ||
        c === 's' ||
        (v === EMPTY && c === ' ') ||
        (v === BLACK && c === 'B') ||
        (v === WHITE && c === 'W');
      if (c === 's') m &&= sealing.has(toKey({ x, y }));
      if (!m) ok = false;
    }
  }
  // Every point autoscore flagged as needing sealing must be marked 's' or '*' in the file.
  for (const p of needsSealing) {
    const c = correctOwnership[p.y][p.x];
    if (c !== 's' && c !== '*') ok = false;
  }
  return ok;
}

for (const file of files) {
  test(`autoscore: ${file}`, () => {
    const data = JSON.parse(readFileSync(dir + file, 'utf-8'));
    const board: number[][] = data.board.map((row: string) =>
      row.split('').map((cell: string) => {
        if (cell === 'w' || cell === 'W') return WHITE;
        if (cell === 'b' || cell === 'B') return BLACK;
        return EMPTY;
      }),
    );
    const rules = data.rules ?? 'chinese';
    const [res] = autoscore(board, rules, data.black, data.white);
    assert.ok(
      matchesOwnership(res.result, res.needs_sealing, data.correct_ownership),
      `${file}: autoscore's result doesn't match correct_ownership`,
    );
    if (data.sealed_ownership) {
      assert.ok(
        matchesOwnership(res.sealed_result, res.needs_sealing, data.sealed_ownership),
        `${file}: autoscore's sealed_result doesn't match sealed_ownership`,
      );
    }
  });
}
