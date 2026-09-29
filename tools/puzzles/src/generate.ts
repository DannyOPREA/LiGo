// The generator (ADR 0024 §1, ADR 0025 §2): catalogue positions, in an order and orientation set
// by a seed, through the wall check, the solver (unsettled positions only), the puzzle tree, the
// difficulty measure and KataGo's second opinion, into puzzles that pass `check`. A run with the
// same seed, catalogue and limits makes the same puzzles.
//
// Licence: MIT (LiGo's own code, ADR 0007).
import {
  SHAPES,
  build,
  describe,
  layout,
  reject,
  variations,
  type Anchor,
  type Layout,
  type Variation,
} from './catalogue.ts';
import { BLACK, WHITE, sgfPoint, type Colour, type Point } from './goban.ts';
import { transform, type Position } from './position.ts';
import { check, type Bounds, type KataGoCheck, type Puzzle, type Theme } from './puzzle.ts';
import { DEFAULT_LIMITS, OutOfBudget, Solver, type SolverLimits } from './solver.ts';
import { Dropped, buildPuzzle, type Built } from './tree.ts';

export const GENERATOR_VERSION = '1';

/** A small seeded random number generator (mulberry32), so runs repeat exactly. */
export function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Candidate {
  layout: Layout;
  variation: Variation;
}

/** Every catalogue position, in the catalogue's order. */
export function candidates(): Candidate[] {
  const out: Candidate[] = [];
  for (const shape of SHAPES) {
    for (const anchor of shape.anchors) {
      const l = layout(shape, anchor);
      for (const variation of variations(l)) out.push({ layout: l, variation });
    }
  }
  return out;
}

export function shuffle<T>(items: T[], rnd: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** The position's stones and region, the same for every turn and mirror image (for duplicates). */
export function canonical(pos: Position, anchor: Anchor): string {
  let best = '';
  for (let o = 0; o < 8; o++) {
    const t = transform(pos, o);
    const all = [...t.black, ...t.white, ...t.region];
    const dx = Math.min(...all.map(p => p.x));
    const dy = Math.min(...all.map(p => p.y));
    const enc = (ps: Point[]) =>
      ps
        .map(p => sgfPoint({ x: p.x - dx, y: p.y - dy }))
        .sort()
        .join('');
    const s = `${anchor}|${enc(t.black)}|${enc(t.white)}|${enc(t.region)}|${t.defender}`;
    if (best === '' || s < best) best = s;
  }
  return best;
}

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** A 5-character id (as lila's puzzle ids) from a text, by FNV-1a. */
export function idOf(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  let s = '';
  for (let i = 0; i < 5; i++) {
    s += BASE62[h % 62];
    h = Math.floor(h / 62) + (i + 1) * 7919;
  }
  return s;
}

/** The part of the board to show: every stone and region point with a margin, snapped to near edges. */
export function boundsOf(pos: Position): Bounds {
  const all = [...pos.black, ...pos.white, ...pos.region];
  const last = pos.size - 1;
  const lo = (v: number) => (v - 1 <= 2 ? 0 : v - 1);
  const hi = (v: number) => (v + 1 >= last - 2 ? last : v + 1);
  return {
    top: lo(Math.min(...all.map(p => p.y))),
    left: lo(Math.min(...all.map(p => p.x))),
    bottom: hi(Math.max(...all.map(p => p.y))),
    right: hi(Math.max(...all.map(p => p.x))),
  };
}

/**
 * The measured difficulty (ADR 0025 §2): the right line's length, how many first moves look
 * plausible (every legal wrong move in the region), and how hard the search had to work. Returns a
 * band's starting rating and a spread of ±150 within it.
 */
export const BANDS = [800, 1200, 1600, 2000] as const;
export const BAND_EDGES = [1.5, 2, 2.5];

export function difficulty(b: Built): { score: number; rating: number } {
  const score = (b.depth - 1) / 2 + Math.log10(1 + b.solverNodes) / 2 + Math.min(b.wrongFirstMoves, 8) / 8;
  let band = 0;
  while (band < BAND_EDGES.length && score >= BAND_EDGES[band]) band++;
  const width = BAND_EDGES[1] - BAND_EDGES[0];
  const lo = band === 0 ? BAND_EDGES[0] - width : BAND_EDGES[band - 1];
  const hi = band === BAND_EDGES.length ? lo + width : BAND_EDGES[band];
  const within = Math.max(0, Math.min(1, (score - lo) / (hi - lo)));
  return { score, rating: Math.round(BANDS[band] - 150 + 300 * within) };
}

export type SecondOpinion = (puzzle: Puzzle, pos: Position, built: Built) => Promise<string | null>;

export interface GenerateOptions {
  seed: number;
  count: number;
  /** KataGo's check: null when it agrees, else why not. */
  katago: { check: SecondOpinion; info: KataGoCheck };
  solverLimits?: SolverLimits;
  /** Stop after this many candidates have been tried (for the gate and tests). */
  maxTried?: number;
  log?: (line: string) => void;
}

export interface Tally {
  tried: number;
  rejected: Record<string, number>;
  settledOrBudget: Record<string, number>;
  dropped: Record<string, number>;
  kept: number;
  /** Positions the solver settled within the budget (the ADR 0025 §2 feasibility gate counts these). */
  solved: number;
  slowestMs: number;
}

const bump = (r: Record<string, number>, k: string) => {
  r[k] = (r[k] ?? 0) + 1;
};

export async function generate(opts: GenerateOptions): Promise<{ puzzles: Puzzle[]; tally: Tally }> {
  const rnd = random(opts.seed);
  const limits = opts.solverLimits ?? DEFAULT_LIMITS;
  const log = opts.log ?? (() => {});
  const tally: Tally = {
    tried: 0,
    rejected: {},
    settledOrBudget: {},
    dropped: {},
    kept: 0,
    solved: 0,
    slowestMs: 0,
  };
  const puzzles: Puzzle[] = [];
  const seen = new Set<string>();
  const ids = new Set<string>();
  for (const c of shuffle(candidates(), rnd)) {
    if (puzzles.length >= opts.count || (opts.maxTried !== undefined && tally.tried >= opts.maxTried)) break;
    const defender: Colour = rnd() < 0.5 ? BLACK : WHITE;
    const orientation = Math.floor(rnd() * 8);
    const wantLive = rnd() < 0.5;
    tally.tried++;
    const pos = transform(build(c.layout, c.variation, defender), orientation);
    const why = reject(pos);
    if (why) {
      bump(tally.rejected, why);
      continue;
    }
    const canon = canonical(pos, c.layout.anchor);
    if (seen.has(canon)) {
      bump(tally.rejected, 'duplicate');
      continue;
    }
    seen.add(canon);
    const attacker: Colour = defender === BLACK ? WHITE : BLACK;
    const started = Date.now();
    let settledAs: string | null = null;
    try {
      const d = new Solver(pos, defender, limits).solve();
      const a = new Solver(pos, attacker, limits).solve();
      if (d === 'unknown' || a === 'unknown') settledAs = 'ko or too deep';
      else {
        tally.solved++;
        if (d === 'attacker') settledAs = 'dead whoever moves';
        else if (a === 'defender') settledAs = 'alive whoever moves';
      }
    } catch (e) {
      if (!(e instanceof OutOfBudget)) throw e;
      settledAs = 'over the time budget';
    } finally {
      tally.slowestMs = Math.max(tally.slowestMs, Date.now() - started);
    }
    if (settledAs) {
      bump(tally.settledOrBudget, settledAs);
      continue;
    }
    const player = wantLive ? defender : attacker;
    let built: Built;
    try {
      built = buildPuzzle(pos, player, undefined, limits);
    } catch (e) {
      if (e instanceof Dropped) bump(tally.dropped, e.message);
      else if (e instanceof OutOfBudget) bump(tally.dropped, 'over the time budget');
      else throw e;
      continue;
    }
    let id = idOf(`${canon}|${built.goal}`);
    for (let salt = 1; ids.has(id); salt++) id = idOf(`${canon}|${built.goal}|${salt}`);
    const anchor = c.layout.anchor;
    const themes: Theme[] = [
      'lifeAndDeath',
      built.goal === 'live' ? 'living' : 'killing',
      anchor,
      'eyeShape',
    ];
    const puzzle: Puzzle = {
      id,
      width: 19,
      height: 19,
      bounds: boundsOf(pos),
      initial_state: { black: pos.black.map(sgfPoint).join(''), white: pos.white.map(sgfPoint).join('') },
      initial_player: player === BLACK ? 'black' : 'white',
      move_tree: built.tree,
      puzzle_player_move_mode: 'free',
      puzzle_opponent_move_mode: 'automatic',
      goal: built.goal,
      themes,
      rating: difficulty(built).rating,
      provenance: {
        source: 'generated',
        generator: '@ligo/puzzles',
        version: GENERATOR_VERSION,
        seed: opts.seed,
        shape: c.layout.shape.name,
        anchor,
        variation: describe(c.variation),
        orientation,
        katago: opts.katago.info,
      },
    };
    const problems = check(puzzle);
    if (problems.length)
      throw new Error(`generated puzzle ${id} fails its own check: ${problems.join('; ')}`);
    const disagreement = await opts.katago.check(puzzle, pos, built);
    if (disagreement) {
      bump(tally.dropped, 'KataGo disagrees');
      log(`KataGo disagrees on ${id} (${c.layout.shape.name}, ${describe(c.variation)}): ${disagreement}`);
      continue;
    }
    ids.add(id);
    puzzles.push(puzzle);
    tally.kept++;
    log(
      `kept ${id}: ${built.goal} ${c.layout.shape.name} (${describe(c.variation)}), rating ${puzzle.rating}`,
    );
  }
  return { puzzles, tally };
}
