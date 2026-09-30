// The one place this package touches goban-engine (as services/scoring's src/goban.ts and
// libs/board's engine.mjs do). goban-engine 8.3.226 is a CommonJS bundle, so it is imported as a
// default export and destructured; the shapes below are the ones this package uses, checked
// against build/engine/GobanEngine.d.ts and MoveTree.d.ts at the pinned version.
//
// Every engine gets LiGo's rule settings (libs/board's LIGO_RULES: situational superko, no
// suicide), repeated here because @ligo/board's rules.mjs is plain JS for the browser; the test
// suite checks the two stay the same.
//
// Licence: LiGo's own code MIT (ADR 0007). goban-engine: Apache-2.0 (COPYING.md).
import gobanEngineDefault from 'goban-engine';

export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;
export type Colour = typeof BLACK | typeof WHITE;
export type Cell = typeof EMPTY | Colour;

export const LIGO_RULES = {
  allow_ko: false,
  allow_superko: false,
  superko_algorithm: 'ssk',
  allow_self_capture: false,
  free_handicap_placement: false,
  throw_all_errors: true,
} as const;

export interface EngineConfig {
  width: number;
  height: number;
  rules: 'japanese' | 'chinese';
  komi: number;
  initial_state: { black: string; white: string };
  initial_player: 'black' | 'white';
}

export interface Point {
  x: number;
  y: number;
}

export interface MoveNode {
  parent: MoveNode | null;
  remove(): void;
}

export interface Engine {
  board: Cell[][];
  width: number;
  height: number;
  cur_move: MoveNode;
  colorToMove(): 'black' | 'white';
  jumpTo(node: MoveNode): void;
  place(
    x: number,
    y: number,
    checkForKo?: boolean,
    errorOnSuperKo?: boolean,
    dontCheckForSuperKo?: boolean,
    dontCheckForSelfCapture?: boolean,
    isTrunkMove?: boolean,
    removed?: Point[],
  ): number;
}

interface GobanEngineModule {
  GobanEngine: new (config: EngineConfig & typeof LIGO_RULES) => Engine;
  GobanMoveError: new (...args: never[]) => Error;
}

const mod = gobanEngineDefault as unknown as GobanEngineModule;

/** An SGF point such as `"dd"`. */
export function sgfPoint({ x, y }: Point): string {
  return String.fromCharCode(97 + x, 97 + y);
}

export function fromSgf(s: string): Point {
  return { x: s.charCodeAt(0) - 97, y: s.charCodeAt(1) - 97 };
}

/** A new engine with LiGo's rules on a `size`×`size` board with the given setup stones. */
export function createEngine(
  size: number,
  black: Point[],
  white: Point[],
  toMove: 'black' | 'white',
): Engine {
  return new mod.GobanEngine({
    width: size,
    height: size,
    rules: 'japanese',
    komi: 6.5,
    initial_state: { black: black.map(sgfPoint).join(''), white: white.map(sgfPoint).join('') },
    initial_player: toMove,
    ...LIGO_RULES,
  });
}

export type Refusal = 'occupied' | 'suicide' | 'superko';

const REFUSALS: Record<string, Refusal> = {
  stone_already_placed_here: 'occupied',
  illegal_self_capture: 'suicide',
  illegal_ko_move: 'superko',
  illegal_board_repetition: 'superko',
};

/**
 * Plays a point (or `null` for a pass) with LiGo's checks. Returns the stones it captured, or why
 * goban refused it (the position is then unchanged).
 */
export function play(engine: Engine, at: Point | null): { captured: Point[] } | { refused: Refusal } {
  const captured: Point[] = [];
  try {
    if (at) engine.place(at.x, at.y, true, true, false, false, false, captured);
    else engine.place(-1, -1, true, true);
    return { captured };
  } catch (e) {
    const id = (e as { message_id?: string }).message_id;
    if (e instanceof mod.GobanMoveError && id !== undefined && Object.hasOwn(REFUSALS, id)) {
      return { refused: REFUSALS[id] };
    }
    throw e;
  }
}

/** Takes the last move back and forgets it, so goban's move tree only holds the line in play. */
export function undo(engine: Engine): void {
  const node = engine.cur_move;
  if (!node.parent) throw new Error('nothing to undo');
  engine.jumpTo(node.parent);
  node.remove();
}
