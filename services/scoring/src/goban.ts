// The one place this package touches goban-engine (as libs/board's engine.mjs does for the
// browser, logs/board-ui.md Lessons). goban-engine 8.3.226 is a CommonJS bundle, so it is
// imported as a default export and destructured (ESM named-export static analysis doesn't see
// through its build); see docs/build-vs-buy/scoring.md point 6.
//
// Licence: LiGo's own code MIT (ADR 0006). goban-engine: Apache-2.0 (COPYING.md).
import gobanEngineDefault from 'goban-engine';

// goban-engine ships types for its own TS sources but not a hand-written .d.ts a consumer can
// import cleanly from the CJS default; the shapes below are the ones this package uses (checked
// against build/engine/index.d.ts in the vendored source at the pinned version).
export interface JGOFMove {
  x: number;
  y: number;
}
export interface JGOFSealingIntersection extends JGOFMove {
  color: 0 | 1 | 2;
}
export interface AutoscoreResult {
  result: number[][];
  sealed_result: number[][];
  removed: JGOFMove[];
  needs_sealing: JGOFSealingIntersection[];
}
export type GobanRules = 'chinese' | 'japanese';

export interface ScoreSide {
  total: number;
  stones: number;
  territory: number;
  prisoners: number;
  scoring_positions: string;
  handicap: number;
  komi: number;
}
export interface Score {
  white: ScoreSide;
  black: ScoreSide;
}

export interface GobanEngineConfig {
  width: number;
  height: number;
  rules: GobanRules;
  initial_state: { black: string; white: string };
  komi: number;
  handicap?: number;
  removed?: JGOFMove[];
}

export interface GobanEngineInstance {
  computeScore(): Score;
}

interface GobanEngineModule {
  GobanEngine: new (config: GobanEngineConfig) => GobanEngineInstance;
  autoscore: (
    board: number[][],
    rules: GobanRules,
    blackPlaysFirstOwnership: number[][],
    whitePlaysFirstOwnership: number[][],
  ) => [AutoscoreResult, string];
  char2num: (ch: string) => number;
  num2char: (num: number) => string;
  encodeMove: (x: number, y: number) => string;
  JGOFNumericPlayerColor: { EMPTY: 0; BLACK: 1; WHITE: 2 };
}

const mod = gobanEngineDefault as unknown as GobanEngineModule;

export const GobanEngine = mod.GobanEngine;
export const autoscore = mod.autoscore;
export const char2num = mod.char2num;
export const num2char = mod.num2char;
export const encodeMove = mod.encodeMove;
export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;
