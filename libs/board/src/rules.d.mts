// Types of rules.mjs for board.ts (TypeScript), kept by hand: lila's TypeScript settings
// (isolatedDeclarations) rule out reading them from the JSDoc. Change both files together.
// Licence: MIT (LiGo's own code, ADR 0006).

export interface Game {
  size: 9 | 13 | 19;
  ruleset: 'japanese' | 'chinese';
  /** Always explicit: goban's own default differs from LiGo's (R-KOMI). */
  komi: number;
  /** 0–9; the stones themselves come in `stones`, as the server placed them. */
  handicap?: number;
  /** The starting stones, as SGF points. */
  stones?: { black: string[]; white: string[] };
  /** Who plays first. */
  toMove?: 'black' | 'white';
}

export interface BoardState {
  /** Rows of `.XO`, top row first. */
  board: string[];
  toMove: 'black' | 'white';
  /** The stones each player has captured. */
  captures: { black: number; white: number };
  /** The point the ko rule forbids next (R-KO-4), as an SGF point. */
  koPoint: string | null;
}

export declare const SIZES: number[];

export declare const LIGO_RULES: {
  readonly allow_ko: false;
  readonly allow_superko: false;
  readonly superko_algorithm: 'ssk';
  readonly allow_self_capture: false;
  readonly free_handicap_placement: false;
  readonly throw_all_errors: true;
};

/** The goban settings of a new LiGo game. */
export declare function gameConfig(game: Game): typeof LIGO_RULES & {
  width: number;
  height: number;
  rules: 'japanese' | 'chinese';
  komi: number;
  handicap: number;
  initial_state: { black: string; white: string };
  initial_player: 'black' | 'white';
};

/** Why goban refused a move, or undefined when the error is not a refusal. */
export declare function refusalOf(error: unknown): 'occupied' | 'suicide' | 'superko' | undefined;

/** What the board shows (an engine: goban-engine's, or the one inside goban's board). */
export declare function stateOf(engine: unknown): BoardState;

/** An SGF point, or `"pass"`, as goban's coordinates. */
export declare function toXY(
  engine: { width: number; height: number },
  move: string,
): { x: number; y: number };

export declare function toSgf(point: { x: number; y: number }): string;
