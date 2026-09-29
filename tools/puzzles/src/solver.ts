// The exact local solver (ADR 0025 §2). Both sides play only inside the puzzle's region, with
// goban-engine's checked play and LiGo's rules, and may pass. A line ends when:
//   - a defender stone outside the region (the target) is captured: the attacker wins;
//   - every target stone is unconditionally alive (Benson): the defender wins;
//   - both sides pass in a row: the defender survived (alive, or seki).
// Ko is left out (ADR 0025 §2): a move that makes a ko, a move goban refuses for superko, and a
// line longer than the depth limit are "unknown". A side with a sure win elsewhere ignores
// unknown lines; otherwise the unknown spreads up and the position is dropped. With every ko
// line cut off, the transposition table (the region's points, passes in a row, the side to move)
// never has to see history.
//
// Licence: MIT (LiGo's own code, ADR 0007).
import { bensonAlive } from './benson.ts';
import { BLACK, WHITE, createEngine, play, undo, type Colour, type Engine, type Point } from './goban.ts';
import { chainAt, key, neighbours, type Position } from './position.ts';

export type Value = 'defender' | 'attacker' | 'unknown';

export interface SolverLimits {
  /** Plies searched below the root before a line counts as unknown. */
  maxDepth: number;
  /** Positions visited before the whole search gives up (unknown). */
  maxNodes: number;
  /** Wall-clock budget in ms for one solve. */
  maxMs: number;
}

/** ADR 0025 §2's budget is 20 s a position; a position is solved twice (each side to move), so
 * each solve gets half. */
export const DEFAULT_LIMITS: SolverLimits = { maxDepth: 30, maxNodes: 2_000_000, maxMs: 10_000 };

export class OutOfBudget extends Error {}

/** A solver bound to one position; moves are played on its engine and taken back. */
export class Solver {
  readonly pos: Position;
  readonly engine: Engine;
  readonly attacker: Colour;
  readonly regionKeys: Set<number>;
  nodes = 0;
  private readonly table = new Map<string, Value>();
  private readonly limits: SolverLimits;
  private deadline = 0;
  private passes = 0;

  constructor(pos: Position, toMove: Colour, limits: SolverLimits = DEFAULT_LIMITS) {
    this.pos = pos;
    this.limits = limits;
    this.attacker = pos.defender === BLACK ? WHITE : BLACK;
    this.regionKeys = new Set(pos.region.map(key));
    this.engine = createEngine(pos.size, pos.black, pos.white, toMove === BLACK ? 'black' : 'white');
  }

  get toMove(): Colour {
    return this.engine.colorToMove() === 'black' ? BLACK : WHITE;
  }

  /** The outcome if the line stopped here, or null while it goes on. */
  terminal(): Value | null {
    const b = this.engine.board;
    if (this.pos.target.some(p => b[p.y][p.x] !== this.pos.defender)) return 'attacker';
    if (this.passes >= 2) return 'defender';
    const { alive, chainOf } = bensonAlive(b, this.pos.size, this.pos.defender, this.regionKeys);
    if (this.pos.target.every(p => alive.has(chainOf.get(key(p))!))) return 'defender';
    return null;
  }

  /** The region's empty points, most promising first (vital points: most empty neighbours). */
  candidates(): Point[] {
    const b = this.engine.board;
    const size = this.pos.size;
    const empties = this.pos.region.filter(p => b[p.y][p.x] === 0);
    const score = (p: Point) => {
      let s = 0;
      for (const n of neighbours(p, size)) {
        if (b[n.y][n.x] === 0 && this.regionKeys.has(key(n))) s += 2;
        else if (b[n.y][n.x] !== 0) {
          const libs = chainAt(b, n, size).liberties.length;
          if (libs <= 2) s += 3 - libs; // attack or defend a short chain
        }
      }
      return s;
    };
    return empties
      .map(p => ({ p, s: score(p) }))
      .sort((a, b2) => b2.s - a.s || key(a.p) - key(b2.p))
      .map(e => e.p);
  }

  private tableKey(): string {
    const b = this.engine.board;
    let k = `${this.toMove}${this.passes}`;
    for (const p of this.pos.region) k += b[p.y][p.x];
    return k;
  }

  /**
   * Plays a move (a point or `null` for a pass) for the side to move. Returns false if goban
   * refused it as occupied or suicide, 'unknown' if the move makes a ko or repeats a position
   * (superko), and true when played. A played move must be taken back with `back`.
   */
  move(at: Point | null): boolean | 'unknown' {
    const before = this.passes;
    const r = play(this.engine, at);
    if ('refused' in r) return r.refused === 'superko' ? 'unknown' : false;
    this.passes = at ? 0 : before + 1;
    this.history.push(before);
    if (at && r.captured.length === 1 && this.isKoShape(at)) {
      this.back();
      return 'unknown';
    }
    return true;
  }

  private history: number[] = [];

  /**
   * A pass by the side to move that doesn't count towards "both sides passed": used to give the
   * other side two moves in a row when testing whether a result is settled.
   */
  forcePass(): void {
    const r = play(this.engine, null);
    if ('refused' in r) throw new Error('a pass was refused');
    this.history.push(this.passes);
    this.passes = 0;
  }

  back(): void {
    undo(this.engine);
    this.passes = this.history.pop()!;
  }

  private isKoShape(at: Point): boolean {
    const b = this.engine.board;
    const colour = b[at.y][at.x];
    const around = neighbours(at, this.pos.size);
    if (around.some(n => b[n.y][n.x] === colour)) return false;
    return around.filter(n => b[n.y][n.x] === 0).length === 1;
  }

  /** The value of the current position with best play, from here. */
  solve(): Value {
    this.deadline = Date.now() + this.limits.maxMs;
    return this.search(0);
  }

  private search(depth: number): Value {
    this.nodes++;
    if (this.nodes > this.limits.maxNodes || ((this.nodes & 1023) === 0 && Date.now() > this.deadline)) {
      throw new OutOfBudget(`solver budget spent after ${this.nodes} positions`);
    }
    const t = this.terminal();
    if (t) return t;
    if (depth >= this.limits.maxDepth) return 'unknown';
    const k = this.tableKey();
    const known = this.table.get(k);
    if (known) return known;
    const mover: Value = this.toMove === this.pos.defender ? 'defender' : 'attacker';
    let unknown = false;
    for (const at of [...this.candidates(), null]) {
      const m = this.move(at);
      if (m === false) continue;
      if (m === 'unknown') {
        unknown = true;
        continue;
      }
      const v = this.search(depth + 1);
      this.back();
      if (v === mover) {
        this.table.set(k, v);
        return v;
      }
      if (v === 'unknown') unknown = true;
    }
    const result: Value = unknown ? 'unknown' : mover === 'defender' ? 'attacker' : 'defender';
    if (result !== 'unknown') this.table.set(k, result);
    return result;
  }

  /** The value after `at` is played by the side to move (the position itself is unchanged). */
  valueAfter(at: Point | null, depth = 1): Value | 'illegal' {
    const m = this.move(at);
    if (m === false) return 'illegal';
    if (m === 'unknown') return 'unknown';
    try {
      return this.search(depth);
    } finally {
      this.back();
    }
  }

  /** Starts the budget clock for a run of `valueAfter` calls. */
  startClock(): void {
    this.deadline = Date.now() + this.limits.maxMs;
  }
}
