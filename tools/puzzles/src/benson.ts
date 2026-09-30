import type { Point } from './goban.ts';
// Benson's test for unconditional life (D. Benson, "Life in the game of Go", 1976), limited to the
// puzzle: the defender's chains and the regions they enclose inside the puzzle's region. A chain
// is unconditionally alive when it has two vital regions (every empty point of the region is one of
// its liberties) among regions all of whose bordering chains are alive too. No move by the
// attacker, however many, can capture such a chain, so the solver can stop there (ADR 0025 §2).
//
// Licence: MIT (LiGo's own code, ADR 0007).
import { key, neighbours } from './position.ts';

interface Region {
  empties: Point[];
  chains: Set<number>;
}

/** The ids (chain index) of the defender's unconditionally alive chains, and each point's chain. */
export function bensonAlive(
  board: number[][],
  size: number,
  defender: number,
  region: Set<number>,
): { alive: Set<number>; chainOf: Map<number, number> } {
  const chainOf = new Map<number, number>();
  const chainLibs: Set<number>[] = [];
  // The defender's chains that touch the region (the only ones that can matter).
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (board[y][x] !== defender || chainOf.has(key({ x, y }))) continue;
      const id = chainLibs.length;
      const libs = new Set<number>();
      const todo = [{ x, y }];
      chainOf.set(key({ x, y }), id);
      while (todo.length) {
        const p = todo.pop()!;
        for (const n of neighbours(p, size)) {
          const c = board[n.y][n.x];
          if (c === 0) libs.add(key(n));
          else if (c === defender && !chainOf.has(key(n))) {
            chainOf.set(key(n), id);
            todo.push(n);
          }
        }
      }
      chainLibs.push(libs);
    }
  }

  // Regions: connected non-defender points, enclosed if they never leave the puzzle's region.
  const regions: Region[] = [];
  const seen = new Set<number>();
  for (const k of region) {
    const start = { x: k % 32, y: Math.floor(k / 32) };
    if (seen.has(k) || board[start.y][start.x] === defender) continue;
    const r: Region = { empties: [], chains: new Set() };
    let enclosed = true;
    const todo = [start];
    seen.add(k);
    while (todo.length) {
      const p = todo.pop()!;
      if (!region.has(key(p))) enclosed = false;
      if (board[p.y][p.x] === 0) r.empties.push(p);
      for (const n of neighbours(p, size)) {
        const c = board[n.y][n.x];
        if (c === defender) r.chains.add(chainOf.get(key(n))!);
        else if (!seen.has(key(n))) {
          seen.add(key(n));
          todo.push(n);
        }
      }
    }
    if (enclosed) regions.push(r);
  }

  let alive = new Set(chainLibs.map((_, i) => i));
  let live = regions;
  for (;;) {
    const vitalCount = new Map<number, number>();
    for (const r of live) {
      for (const c of r.chains) {
        if (r.empties.every(p => chainLibs[c].has(key(p)))) vitalCount.set(c, (vitalCount.get(c) ?? 0) + 1);
      }
    }
    const next = new Set([...alive].filter(c => (vitalCount.get(c) ?? 0) >= 2));
    const nextRegions = live.filter(r => [...r.chains].every(c => next.has(c)));
    if (next.size === alive.size && nextRegions.length === live.length) break;
    alive = next;
    live = nextRegions;
  }
  return { alive, chainOf };
}
