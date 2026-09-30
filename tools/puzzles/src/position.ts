// A puzzle position before it is solved: the board, the region both sides may play in, who
// defends, and the defender's main chain (ADR 0025 §2). Built from a small diagram:
//
//   X O   stones that are not in the region (the wall, the defender's own shape)
//   x o   stones inside the region (they can be captured, and the point played again)
//   .     an empty point in the region
//   -     an empty point outside the region
//
// X is always the defender in a diagram; `place` gives it a colour. Diagrams are drawn in the
// top-left corner and placed on the board by `place`, turned and mirrored to any corner.
//
// Licence: MIT (LiGo's own code, ADR 0007).
import { BLACK, WHITE, type Colour, type Point } from './goban.ts';

export interface Position {
  size: number;
  black: Point[];
  white: Point[];
  defender: Colour;
  /** The points either side may play: the empty region points and the stones inside it. */
  region: Point[];
  /** One point of each original defender stone outside the region: losing any of them loses. */
  target: Point[];
}

export interface Diagram {
  rows: string[];
}

export function parseDiagram(text: string): Diagram {
  const rows = text
    .split('\n')
    .map(r => r.replace(/\s+/g, ''))
    .filter(r => r.length > 0);
  const bad = rows.join('').replace(/[XOxo.\-]/g, '');
  if (bad) throw new Error(`diagram: unknown characters "${bad}"`);
  return { rows };
}

/** The eight ways to turn and mirror a corner diagram onto a board's corners. */
export const ORIENTATIONS = 8;

/** A point turned and mirrored by orientation `o` (0–7) on a `size` board. */
export function orient(p: Point, size: number, o: number): Point {
  let { x, y } = p;
  if (o & 4) [x, y] = [y, x];
  if (o & 1) x = size - 1 - x;
  if (o & 2) y = size - 1 - y;
  return { x, y };
}

/** The same position turned and mirrored by orientation `o` (0–7). */
export function transform(pos: Position, o: number): Position {
  const t = (ps: Point[]) => ps.map(p => orient(p, pos.size, o));
  return { ...pos, black: t(pos.black), white: t(pos.white), region: t(pos.region), target: t(pos.target) };
}

/** Places a diagram on a `size` board, turned by orientation `o` (0–7), X playing `defender`. */
export function place(d: Diagram, size: number, defender: Colour, o = 0): Position {
  const attacker = defender === BLACK ? WHITE : BLACK;
  const pos: Position = { size, black: [], white: [], defender, region: [], target: [] };
  const stones = (c: Colour) => (c === BLACK ? pos.black : pos.white);
  d.rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (x >= size || y >= size) throw new Error('diagram larger than the board');
      const p = orient({ x, y }, size, o);
      if (ch === 'X' || ch === 'x') stones(defender).push(p);
      if (ch === 'O' || ch === 'o') stones(attacker).push(p);
      if (ch === 'X') pos.target.push(p);
      if (ch === '.' || ch === 'x' || ch === 'o') pos.region.push(p);
    });
  });
  if (pos.target.length === 0) throw new Error('diagram has no defender stones outside the region');
  return pos;
}

export function key(p: Point): number {
  return p.y * 32 + p.x;
}

export function neighbours(p: Point, size: number): Point[] {
  const out: Point[] = [];
  if (p.x > 0) out.push({ x: p.x - 1, y: p.y });
  if (p.x < size - 1) out.push({ x: p.x + 1, y: p.y });
  if (p.y > 0) out.push({ x: p.x, y: p.y - 1 });
  if (p.y < size - 1) out.push({ x: p.x, y: p.y + 1 });
  return out;
}

/** The chain through `start` on `board` and its liberties. */
export function chainAt(
  board: number[][],
  start: Point,
  size: number,
): { stones: Point[]; liberties: Point[] } {
  const colour = board[start.y][start.x];
  const seen = new Set<number>([key(start)]);
  const libs = new Map<number, Point>();
  const stones: Point[] = [];
  const todo = [start];
  while (todo.length) {
    const p = todo.pop()!;
    stones.push(p);
    for (const n of neighbours(p, size)) {
      const c = board[n.y][n.x];
      if (c === 0) libs.set(key(n), n);
      else if (c === colour && !seen.has(key(n))) {
        seen.add(key(n));
        todo.push(n);
      }
    }
  }
  return { stones, liberties: [...libs.values()] };
}
