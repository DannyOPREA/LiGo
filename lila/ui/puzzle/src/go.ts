// The small pure facts the trainer page works from (unit 8.7): the preference's meaning, what a goal
// asks of the player, and the shape of the part of the board a puzzle shows. No rules here: goban
// (libs/board's puzzle board) decides right and wrong.
// Licence: AGPL-3.0-or-later, like the rest of lila.

import type { PuzzleJson } from './interfaces';

/** `Pref.ConfirmMoves` (lila/modules/pref), as the game page resolves it (unit 2.3). */
export const ConfirmMoves = { NEVER: 0, TOUCH: 1, ALWAYS: 2 } as const;

/** Whether taps only preview the stone, for a `Pref.ConfirmMoves` value on this kind of device. */
export const resolveConfirm = (confirmMoves: number | undefined, touch: boolean): boolean => {
  const pref = confirmMoves ?? ConfirmMoves.TOUCH;
  return pref === ConfirmMoves.ALWAYS || (pref === ConfirmMoves.TOUCH && touch);
};

export const colorName = (c: 'black' | 'white'): string => (c === 'white' ? 'White' : 'Black');

/** What the player is to do, from the puzzle's goal (the classics may also have ko, capture or connect). */
export function goalText(goal: string, color: 'black' | 'white'): string {
  const who = colorName(color);
  switch (goal) {
    case 'live':
      return `${who} to live`;
    case 'kill':
      return `${who} to kill`;
    case 'ko':
      return `${who} to win the ko`;
    case 'capture':
      return `${who} to win the capturing race`;
    case 'connect':
      return `${who} to connect`;
    default:
      return `${who} to play`;
  }
}

/**
 * Rows over columns of what the board shows, coordinate bands included (goban draws one on each shown
 * edge of the board), so the board's box fits the puzzle's `bounds`: libs/board sizes the board from
 * the box's width, and a corner problem shouldn't leave a square of empty space on a phone.
 */
export function boardRatio(puzzle: Pick<PuzzleJson, 'width' | 'bounds'>, coordinates: boolean): number {
  const last = puzzle.width - 1;
  const b = puzzle.bounds ?? { top: 0, left: 0, bottom: last, right: last };
  const band = (edge: boolean) => (coordinates && edge ? 1 : 0);
  const across = b.right - b.left + 1 + band(b.left === 0) + band(b.right === last);
  const down = b.bottom - b.top + 1 + band(b.top === 0) + band(b.bottom === last);
  return Math.round((down / across) * 1000) / 1000;
}
