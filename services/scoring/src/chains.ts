import type { Board } from './board.ts';
// Widening a set of dead points to whole chains (ADR 0020 §1: "dead is always whole chains: the
// service widens autoscore's answer to every stone of each chain it touches before counting"),
// and checking that a set given by lila (a `count` request's `dead`) already is whole chains, so
// a request that isn't can be answered with an `error` reply rather than silently widened.
//
// Licence: MIT (LiGo's own code, ADR 0006).
import { EMPTY, type JGOFMove } from './goban.ts';

const key = (x: number, y: number) => `${x},${y}`;

/** Every stone connected to (x, y) by orthogonal same-colour adjacency (its chain). Empty if the
 * point is empty. */
export function chainAt(board: Board, x: number, y: number): JGOFMove[] {
  const colour = board[y]?.[x];
  if (colour === undefined || colour === EMPTY) return [];
  const height = board.length;
  const width = board[0].length;
  const seen = new Set<string>();
  const stack: JGOFMove[] = [{ x, y }];
  const chain: JGOFMove[] = [];
  seen.add(key(x, y));
  while (stack.length > 0) {
    const p = stack.pop()!;
    chain.push(p);
    const neighbours = [
      { x: p.x - 1, y: p.y },
      { x: p.x + 1, y: p.y },
      { x: p.x, y: p.y - 1 },
      { x: p.x, y: p.y + 1 },
    ];
    for (const n of neighbours) {
      if (n.x < 0 || n.x >= width || n.y < 0 || n.y >= height) continue;
      if (board[n.y][n.x] !== colour) continue;
      const k = key(n.x, n.y);
      if (seen.has(k)) continue;
      seen.add(k);
      stack.push(n);
    }
  }
  return chain;
}

/** Widens a set of points to every stone of every chain any of them touches. Stable order: each
 * chain's own points in the order chainAt visits them, chains in the order their first point was
 * first seen. Points on empty intersections are dropped (autoscore never marks an empty point
 * dead; a malformed request might). */
export function widenToChains(board: Board, points: JGOFMove[]): JGOFMove[] {
  const seen = new Set<string>();
  const out: JGOFMove[] = [];
  for (const p of points) {
    const k = key(p.x, p.y);
    if (seen.has(k)) continue;
    const chain = chainAt(board, p.x, p.y);
    for (const s of chain) {
      const sk = key(s.x, s.y);
      if (seen.has(sk)) continue;
      seen.add(sk);
      out.push(s);
    }
  }
  return out;
}

/** True when `points` is already exactly a union of whole chains: widening it changes nothing. */
export function isWholeChains(board: Board, points: JGOFMove[]): boolean {
  const given = new Set(points.map(p => key(p.x, p.y)));
  if (given.size !== points.length) return false; // a duplicate point is not "as received"
  const widened = widenToChains(board, points);
  return widened.length === given.size && widened.every(p => given.has(key(p.x, p.y)));
}
