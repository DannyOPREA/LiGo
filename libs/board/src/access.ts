// Keyboard and screen-reader words for the board (unit 9.4, ADR 0026 §4): the point names printed on
// a board (letters A-T without I, numbers from the bottom, never SGF's two letters) and the
// sentences the board's live region reads out. English until lila's i18n reaches the board (9.7).
// Licence: MIT (LiGo's own code, ADR 0006).

const LETTERS = 'ABCDEFGHJKLMNOPQRSTUVWXYZ';

/** The name printed on the board for column `x` and row `y` (0 = top), such as "D4". */
export function pointName(size: number, x: number, y: number): string {
  return `${LETTERS[x]}${size - y}`;
}

/** An SGF point (`"dd"`) as printed on the board. */
export function sgfName(size: number, move: string): string {
  return pointName(size, move.charCodeAt(0) - 97, move.charCodeAt(1) - 97);
}

const colourName = { black: 'Black', white: 'White' } as const;

export function playedText(size: number, move: string, color: 'black' | 'white', captured: number): string {
  if (move === 'pass') return `${colourName[color]} passes`;
  const took = captured === 0 ? '' : `, ${captured} ${captured === 1 ? 'stone' : 'stones'} captured`;
  return `${colourName[color]} ${sgfName(size, move)}${took}`;
}

export function refusedText(reason: 'occupied' | 'suicide' | 'superko', point?: string): string {
  if (reason === 'occupied') return `Illegal: ${point ?? 'that point'} is occupied`;
  return reason === 'suicide' ? 'Illegal: suicide' : 'Illegal: ko';
}

const content = { '.': 'empty', X: 'black', O: 'white' } as Record<string, string>;

/** What is on a point: "D4 black". */
export function pointText(board: string[], x: number, y: number): string {
  return `${pointName(board.length, x, y)} ${content[board[y][x]]}`;
}

/** The point and its neighbours, for the describe key: "D4 empty. Up D5 white, ...". */
export function describeText(board: string[], x: number, y: number): string {
  const size = board.length;
  const near = (
    [
      ['up', x, y - 1],
      ['down', x, y + 1],
      ['left', x - 1, y],
      ['right', x + 1, y],
    ] as const
  )
    .filter(([, i, j]) => i >= 0 && j >= 0 && i < size && j < size)
    .map(([side, i, j]) => `${side} ${pointText(board, i, j)}`);
  const text = near.join(', ');
  return `${pointText(board, x, y)}. ${text[0].toUpperCase()}${text.slice(1)}`;
}

export const HELP: string =
  'Arrow keys move over the points, Home and End go to the row ends, Page Up and Page Down to the ' +
  'top and bottom rows. Enter or Space plays a stone (with Confirm moves on, press it again to ' +
  'confirm). P passes. D describes the point and its neighbours.';
