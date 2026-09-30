// The board and stone themes LiGo offers (ADR 0026 §3), kept apart from board.ts so a page can list
// them without loading goban (board.ts is loaded lazily).
// Licence: MIT (LiGo's own code, ADR 0006).

/**
 * goban's board themes drawn from code alone (ADR 0026 §3). Its wood, granite and anime themes load
 * pictures from OGS's CDN with no stated licence, and "Custom" loads any URL: never offered.
 */
export const BOARD_THEMES = ['Plain', 'Book', 'Night Play', 'HNG', 'HNG Night'] as const;
export type BoardTheme = (typeof BOARD_THEMES)[number];

/** goban's stone themes drawn from code, black and white as goban pairs them (Slate for Black, Shell for White). */
export const STONE_THEMES = ['Plain', 'Slate & Shell', 'Glass', 'Worn Glass', 'Night'] as const;
export type StoneTheme = (typeof STONE_THEMES)[number];

export interface Theme {
  board: BoardTheme;
  stones: StoneTheme;
}

export const DEFAULT_THEME: Theme = { board: 'Plain', stones: 'Plain' };
