import type { Move } from '@ligo/board/board';

export type Ruleset = 'japanese' | 'chinese';
export type Size = 9 | 13 | 19;

export interface GameSettings {
  size: Size;
  ruleset: Ruleset;
  /** 0 (even) or 2–9. 13×13 has no fixed handicap table yet (R-SCOPE-1), so it stays 0. */
  handicap: number;
  komi: number;
}

export type Redraw = () => void;

export interface PlaygroundConfig {
  /** Nothing is passed from the server: the page starts with LiGo's own default settings. */
  moves?: Move[];
}
