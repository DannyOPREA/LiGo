// Grading an autoscore answer against a game's `correct_ownership` (OGS goban's own pass rule,
// `test/test_autoscore.ts`'s `test_result`, shared by `test/autoscore.test.ts` and `src/bench.ts`
// so both grade exactly the same way, unit 4.6 review fix B1).
//
// `result` is autoscore's raw `res.result` (or `res.sealed_result`): a territory-filled ownership
// grid, not the board with dead stones blanked. `correct_ownership` characters: '*' matches
// anything, 's' matches only a point autoscore also flagged as needing sealing, ' '/'B'/'W' match
// EMPTY/BLACK/WHITE. The reverse check: every point autoscore flagged as needing sealing must be
// 's' or '*' in the file.
//
// Licence: MIT (LiGo's own code, ADR 0006); the rule is reproduced from OGS goban (Apache-2.0).
import { BLACK, EMPTY, WHITE, type JGOFMove } from './goban.ts';

const key = (p: JGOFMove) => `${p.x},${p.y}`;

export function cellChar(v: number): string {
  return v === BLACK ? 'B' : v === WHITE ? 'W' : ' ';
}

/** Every disagreement between `result`/`needsSealing` and `correctOwnership`, as readable strings;
 * empty means the game passes. */
export function ownershipMismatches(
  result: number[][],
  needsSealing: JGOFMove[],
  correctOwnership: string[],
): string[] {
  const sealing = new Set(needsSealing.map(key));
  const out: string[] = [];
  for (let y = 0; y < result.length; y += 1) {
    for (let x = 0; x < result[0].length; x += 1) {
      const v = result[y][x];
      const c = correctOwnership[y][x];
      let ok =
        c === '*' ||
        c === 's' ||
        (v === EMPTY && c === ' ') ||
        (v === BLACK && c === 'B') ||
        (v === WHITE && c === 'W');
      if (c === 's') ok &&= sealing.has(key({ x, y }));
      if (!ok) out.push(`(${x},${y}) got '${cellChar(v)}' want '${c}'`);
    }
  }
  for (const p of needsSealing) {
    const c = correctOwnership[p.y][p.x];
    if (c !== 's' && c !== '*') out.push(`(${p.x},${p.y}) flagged as needing sealing but want '${c}'`);
  }
  return out;
}

export function matchesOwnership(
  result: number[][],
  needsSealing: JGOFMove[],
  correctOwnership: string[],
): boolean {
  return ownershipMismatches(result, needsSealing, correctOwnership).length === 0;
}

/** Secondary metric (reported, never gated): does the proposed `dead` set agree with the file's
 * stones? A stone is expected dead when `correct_ownership` gives its point to the other colour,
 * and alive when it gives it to the stone's own colour; other characters say nothing. */
export function deadSetAgrees(board: number[][], dead: JGOFMove[], correctOwnership: string[]): boolean {
  const deadKeys = new Set(dead.map(key));
  for (let y = 0; y < board.length; y += 1) {
    for (let x = 0; x < board[0].length; x += 1) {
      const stone = board[y][x];
      if (stone === EMPTY) continue;
      const c = correctOwnership[y][x];
      const isDead = deadKeys.has(key({ x, y }));
      if (c === 'B' || c === 'W') {
        const expectDead = (c === 'B') !== (stone === BLACK);
        if (expectDead !== isDead) return false;
      }
    }
  }
  return true;
}
