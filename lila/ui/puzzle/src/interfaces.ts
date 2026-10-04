// The trainer page's data (unit 8.7): what lila's puzzle JSON holds for a Go puzzle (ADR 0025 §1,
// `JsonView.puzzleJson`). The puzzle itself is goban's puzzle format, which `@ligo/board/puzzle`
// plays; lila's own fields (id, rating, plays, themes) and LiGo's (goal, source) sit beside it.

import type { Puzzle as BoardPuzzle } from '@ligo/board/puzzle';

export type PuzzleId = string;
/** A theme's key: lila's `mix`, or one of the Go themes (`PuzzleTheme.scala`). */
export type ThemeKey = string;

/** goban's move tree: the root, then each line, its last node marked right or wrong. */
export type MoveTree = BoardPuzzle['move_tree'];

export type PuzzleDifficulty = 'easiest' | 'easier' | 'normal' | 'harder' | 'hardest';

export interface PuzzleSettings {
  difficulty: PuzzleDifficulty;
}

export interface PuzzleOpts {
  pref: PuzzlePrefs;
  data: PuzzleData;
  settings: PuzzleSettings;
  /** Every theme's name and description: the server translates them (the Go themes have no i18n keys). */
  themeNames: Record<ThemeKey, ThemeName>;
  /** The themes a signed-in player may vote on, and the ones no vote can change. */
  themes?: {
    dynamic: string;
    static: string;
  };
  showRatings: boolean;
}

export interface ThemeName {
  name: string;
  desc: string;
}

/** The preferences the page reads: `Pref.coords` and `Pref.confirmMoves`. */
export interface PuzzlePrefs {
  coords: number;
  confirmMoves?: number;
}

export interface Angle {
  key: ThemeKey;
  name: string;
  desc: string;
}

export interface PuzzleData {
  puzzle: PuzzleJson;
  angle: Angle;
  user?: PuzzleUser;
  replay?: PuzzleReplay;
  isDaily?: boolean;
}

export interface PuzzleReplay {
  i: number;
  of: number;
  days: number;
}

export interface PuzzleUser {
  rating: number;
  provisional?: boolean;
}

/** goban's puzzle, plus lila's and LiGo's fields. */
export interface PuzzleJson extends BoardPuzzle {
  id: PuzzleId;
  rating: number;
  plays: number;
  themes: ThemeKey[];
  /** "live" or "kill" (the classics may also have "ko", "capture" or "connect"). */
  goal: string;
  /** One line for under the board: where the puzzle comes from. */
  source: string;
}

export interface PuzzleResult {
  round?: PuzzleRound;
  next?: PuzzleData;
  replayComplete?: boolean;
}

export type RoundThemes = Record<ThemeKey, boolean | undefined>;

export interface PuzzleRound {
  win: boolean;
  ratingDiff: number;
  themes?: RoundThemes;
}
