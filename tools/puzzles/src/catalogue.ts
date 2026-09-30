// The catalogue of eye spaces (ADR 0025 §2) and the positions built from them. Each shape is the
// empty space a group encloses, drawn with '.' for its points and '-' for points that aren't in it,
// first line at the top. A position puts the shape at an anchor (corner, edge or centre of a 19×19
// board), surrounds it with the defender's stones (every point next to it, diagonals too), then
// surrounds those with a solid wall of the attacker's stones, and applies one variation:
//   - stones inside: the attacker's or the defender's, on points of the space (up to two);
//   - weak points: the defender's stones left out, so the attacker can push in there (up to two);
//   - at most three of these changes together, or none (the plain shape; usually settled, so dropped).
// The generator (generate.ts) then keeps what the wall check and the solver accept.
//
// Licence: MIT (LiGo's own code, ADR 0007).
import { BLACK, WHITE, type Colour, type Point } from './goban.ts';
import { chainAt, key, neighbours, type Position } from './position.ts';

export type Anchor = 'corner' | 'edge' | 'centre';

export interface Shape {
  name: string;
  rows: string[];
  anchors: Anchor[];
}

const ALL: Anchor[] = ['corner', 'edge', 'centre'];
const SIDES: Anchor[] = ['corner', 'edge'];

/** Textbook eye spaces and their near relations. Centre shapes are the ones small enough to stay
 * within the solver's region limit with the ring of defender stones around them. */
export const SHAPES: Shape[] = [
  { name: 'straight three', rows: ['...'], anchors: ALL },
  { name: 'bent three', rows: ['..', '.-'], anchors: ALL },
  { name: 'straight four', rows: ['....'], anchors: ALL },
  { name: 'bent four', rows: ['...', '.--'], anchors: ALL },
  { name: 'square four', rows: ['..', '..'], anchors: ALL },
  { name: 'pyramid four', rows: ['...', '-.-'], anchors: ALL },
  { name: 'straight five', rows: ['.....'], anchors: SIDES },
  { name: 'bulky five', rows: ['...', '..-'], anchors: ALL },
  { name: 'crossed five', rows: ['-.-', '...', '-.-'], anchors: ALL },
  { name: 'bent five', rows: ['....', '.---'], anchors: SIDES },
  { name: 'l five', rows: ['...', '.--', '.--'], anchors: SIDES },
  { name: 'rabbity six', rows: ['-.-', '...', '..-'], anchors: ALL },
  { name: 'six in a rectangle', rows: ['...', '...'], anchors: SIDES },
  { name: 'straight six', rows: ['......'], anchors: SIDES },
  { name: 'six on the side', rows: ['....', '-..-'], anchors: SIDES },
  { name: 'bent six', rows: ['.....', '.----'], anchors: SIDES },
  { name: 'l six', rows: ['....', '.---', '.---'], anchors: ['corner'] },
  { name: 'seven on the side', rows: ['.....', '-..--'], anchors: SIDES },
  { name: 'seven in the corner', rows: ['....', '...-'], anchors: SIDES },
  { name: 'eight in the corner', rows: ['....', '....'], anchors: ['corner'] },
];

export const BOARD_SIZE = 19;

const OFFSETS: Record<Anchor, Point> = {
  corner: { x: 0, y: 0 },
  edge: { x: 6, y: 0 },
  centre: { x: 7, y: 7 },
};

export interface Stone {
  at: Point;
  side: 'attacker' | 'defender';
}

export interface Variation {
  /** Points of the defender's ring left empty (they join the region). */
  gaps: Point[];
  /** Stones put on points of the eye space. */
  inside: Stone[];
}

export interface Layout {
  shape: Shape;
  anchor: Anchor;
  eye: Point[];
  ring: Point[];
  wall: Point[];
}

const ring8 = (points: Point[], size: number): Point[] => {
  const inside = new Set(points.map(key));
  const out = new Map<number, Point>();
  for (const p of points) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const q = { x: p.x + dx, y: p.y + dy };
        if (q.x < 0 || q.y < 0 || q.x >= size || q.y >= size || inside.has(key(q))) continue;
        out.set(key(q), q);
      }
    }
  }
  return [...out.values()].sort((a, b) => key(a) - key(b));
};

export function layout(shape: Shape, anchor: Anchor, size = BOARD_SIZE): Layout {
  const o = OFFSETS[anchor];
  const eye: Point[] = [];
  shape.rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === '.') eye.push({ x: x + o.x, y: y + o.y });
      else if (ch !== '-') throw new Error(`shape ${shape.name}: unknown character "${ch}"`);
    });
  });
  const ring = ring8(eye, size);
  const wall = ring8([...eye, ...ring], size);
  return { shape, anchor, eye, ring, wall };
}

/** Pairs of distinct items, each pair once. */
const pairs = <T>(items: T[]): [T, T][] =>
  items.flatMap((a, i) => items.slice(i + 1).map(b => [a, b] as [T, T]));

/**
 * Every variation of a layout, in a fixed order (the generator samples them with its seed): up to
 * two weak points and up to two stones inside, at most three changes in all.
 */
export function variations(l: Layout): Variation[] {
  const wallKeys = new Set(l.wall.map(key));
  const weak = l.ring.filter(p => neighbours(p, BOARD_SIZE).some(n => wallKeys.has(key(n))));
  const stones: Stone[] = l.eye.flatMap(at => [
    { at, side: 'attacker' as const },
    { at, side: 'defender' as const },
  ]);
  const gapSets: Point[][] = [[], ...weak.map(p => [p]), ...pairs(weak)];
  const stoneSets: Stone[][] = [
    [],
    ...stones.map(s => [s]),
    ...pairs(stones).filter(([a, b]) => key(a.at) !== key(b.at)),
  ];
  const out: Variation[] = [];
  for (const gaps of gapSets) {
    for (const inside of stoneSets) if (gaps.length + inside.length <= 3) out.push({ gaps, inside });
  }
  return out;
}

/** The position a layout and variation make, with `defender` as the defender's colour. */
export function build(l: Layout, v: Variation, defender: Colour, size = BOARD_SIZE): Position {
  const attacker: Colour = defender === BLACK ? WHITE : BLACK;
  const pos: Position = { size, black: [], white: [], defender, region: [], target: [] };
  const stones = (c: Colour) => (c === BLACK ? pos.black : pos.white);
  const gapKeys = new Set(v.gaps.map(key));
  for (const p of l.ring) {
    if (gapKeys.has(key(p))) continue;
    stones(defender).push(p);
    pos.target.push(p);
  }
  stones(attacker).push(...l.wall);
  pos.region.push(...l.eye, ...v.gaps);
  for (const s of v.inside) stones(s.side === 'attacker' ? attacker : defender).push(s.at);
  return pos;
}

/** A readable name for a variation, stored in the provenance. */
export function describe(v: Variation): string {
  const parts: string[] = [];
  for (const s of v.inside) parts.push(`${s.side} stone inside at ${s.at.x},${s.at.y}`);
  for (const g of v.gaps) parts.push(`weak point at ${g.x},${g.y}`);
  return parts.length ? parts.join('; ') : 'plain';
}

export type Rejection =
  | 'no liberties'
  | 'region too big'
  | 'wall not safe'
  | 'defender can escape'
  | 'defender in pieces';

/** The board as goban-engine's matrix. */
export function boardOf(pos: Position): number[][] {
  const b = Array.from({ length: pos.size }, () => Array.from({ length: pos.size }, () => 0));
  for (const p of pos.black) b[p.y][p.x] = BLACK;
  for (const p of pos.white) b[p.y][p.x] = WHITE;
  return b;
}

/**
 * Why a position can't be used, or null (ADR 0025 §2):
 *   - a chain without liberties;
 *   - more than `maxEmpty` empty points in the region;
 *   - an attacker chain touching the region with fewer than 3 liberties outside it (the solver
 *     treats the wall as alive, so it must be);
 *   - a defender chain with a liberty outside the region (it could run away);
 *   - the defender's stones outside the region in more than one chain: the goal is one group
 *     living or dying, and a weak point that cuts the ring would make "lose any stone" the goal.
 */
export function reject(pos: Position, maxEmpty = 10): Rejection | null {
  const b = boardOf(pos);
  const region = new Set(pos.region.map(key));
  const seen = new Set<number>();
  const attacker = pos.defender === BLACK ? WHITE : BLACK;
  for (let y = 0; y < pos.size; y++) {
    for (let x = 0; x < pos.size; x++) {
      if (b[y][x] === 0 || seen.has(key({ x, y }))) continue;
      const c = chainAt(b, { x, y }, pos.size);
      for (const s of c.stones) seen.add(key(s));
      if (c.liberties.length === 0) return 'no liberties';
      const outside = c.liberties.filter(l => !region.has(key(l))).length;
      const touches = c.stones.some(
        s => region.has(key(s)) || neighbours(s, pos.size).some(n => region.has(key(n))),
      );
      if (b[y][x] === attacker && touches && !c.stones.every(s => region.has(key(s))) && outside < 3) {
        return 'wall not safe';
      }
      if (b[y][x] === pos.defender && outside > 0) return 'defender can escape';
    }
  }
  if (pos.region.filter(p => b[p.y][p.x] === 0).length > maxEmpty) return 'region too big';
  const group = new Set(chainAt(b, pos.target[0], pos.size).stones.map(key));
  if (!pos.target.every(p => group.has(key(p)))) return 'defender in pieces';
  return null;
}
