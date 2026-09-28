// The compact board string (ADR 0019 §6, ADR 0020 §1): rows top to bottom separated by '/',
// 'b'/'w' for stones, and a run of empty points as the decimal count of that run (not a single
// digit: unlike a chess FEN's max-8 rows, a run on a 19-wide board can be longer than 9, so a run
// of, say, 12 empty points is written "12"). Points elsewhere in the protocol (`dead`, `seal`) are
// two-letter SGF coordinates, column then row, 'a' upwards, the letter 'i' used (spec §2,
// R-BOARD-4) — exactly goban-engine's own move encoding (char2num/num2char/encodeMove), which
// this module reuses instead of writing a second copy of it.
//
// Licence: MIT (LiGo's own code, ADR 0006).
import { BLACK, WHITE, EMPTY, char2num, encodeMove, type JGOFMove } from './goban.ts';

export type Board = number[][]; // rows top to bottom; each cell EMPTY/BLACK/WHITE

/** Parses a compact board string into a board matrix. Throws on a malformed string (wrong row
 * count, a row whose points don't add up to `size`, or an unknown character). */
export function parseBoard(compact: string, size: number): Board {
  const rows = compact.split('/');
  if (rows.length !== size) {
    throw new Error(`board has ${rows.length} rows, expected ${size}`);
  }
  return rows.map((row, y) => parseRow(row, size, y));
}

function parseRow(row: string, size: number, y: number): number[] {
  const cells: number[] = [];
  let i = 0;
  while (i < row.length) {
    const ch = row[i];
    // Lowercase only (ADR 0019 §6, R-BOARD-4): the protocol is `[a-s]{2}` points and lowercase
    // 'b'/'w' stones; an uppercase 'B'/'W' is rejected rather than accepted leniently.
    if (ch === 'b') {
      cells.push(BLACK);
      i += 1;
    } else if (ch === 'w') {
      cells.push(WHITE);
      i += 1;
    } else if (ch >= '0' && ch <= '9') {
      let j = i;
      while (j < row.length && row[j] >= '0' && row[j] <= '9') j += 1;
      const digits = row.slice(i, j);
      // A run's digits are never "0" (an empty run means nothing) and never lead with a '0'
      // (canonical form has none), and a run longer than the board itself is rejected before it
      // is ever expanded into cells (this also guards against a huge run inflating a small `size`
      // into a huge allocation).
      if (digits[0] === '0') {
        throw new Error(`board row ${y} has a run '${digits}' with a leading zero`);
      }
      const n = Number(digits);
      if (n > size) {
        throw new Error(`board row ${y} has a run of ${n} empty points, longer than the board (${size})`);
      }
      for (let k = 0; k < n; k += 1) cells.push(EMPTY);
      i = j;
    } else {
      throw new Error(`board row ${y} has an invalid character '${ch}'`);
    }
  }
  if (cells.length !== size) {
    throw new Error(`board row ${y} has ${cells.length} points, expected ${size}`);
  }
  return cells;
}

/** The inverse of parseBoard, for tests and for the CLI's echo. */
export function formatBoard(board: Board): string {
  return board
    .map(row => {
      let out = '';
      let run = 0;
      for (const cell of row) {
        if (cell === EMPTY) {
          run += 1;
          continue;
        }
        if (run > 0) {
          out += String(run);
          run = 0;
        }
        out += cell === BLACK ? 'b' : 'w';
      }
      if (run > 0) out += String(run);
      return out;
    })
    .join('/');
}

/** goban-engine's `initial_state`: every black (or white) point's coordinates concatenated as
 * two-letter SGF points, e.g. "aabbcc" (memo 1.2, board-ui.md Lessons: pass stones in explicitly,
 * never goban's own handicap placement). */
export function initialState(board: Board): { black: string; white: string } {
  let black = '';
  let white = '';
  for (let y = 0; y < board.length; y += 1) {
    for (let x = 0; x < board[y].length; x += 1) {
      const cell = board[y][x];
      if (cell === BLACK) black += encodeMove(x, y);
      else if (cell === WHITE) white += encodeMove(x, y);
    }
  }
  return { black, white };
}

/** Parses a list of two-letter SGF points (e.g. ["pd", "qc"]) into goban-engine move objects. */
export function parsePoints(points: string[]): JGOFMove[] {
  return points.map(p => {
    if (p.length !== 2) throw new Error(`invalid point '${p}'`);
    const x = char2num(p[0]);
    const y = char2num(p[1]);
    if (x < 0 || y < 0) throw new Error(`invalid point '${p}'`);
    return { x, y };
  });
}

/** The inverse of parsePoints. */
export function formatPoints(points: JGOFMove[]): string[] {
  return points.map(p => encodeMove(p.x, p.y));
}
