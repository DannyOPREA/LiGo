// The tsumego frame: fills the rest of the board around a local problem so that the problem alone
// decides the game, which makes KataGo read it (ADR 0025 §2, KataGo's second opinion).
//
// Ported to TypeScript from KaTrain's katrain/core/tsumego_frame.py (MIT, "Copyright 2020 Sander
// Land and/or other authors of the content in this repository"; the file says "tsumego frame
// ported from lizgoban by kaorahi"). KaTrain's full notice is in LICENSE-katrain.txt. Only KaTrain's file
// was read for this port. The structure and names follow it closely so the two can be compared:
// coordinates are (i, j) = (row, column); the problem is flipped into a standard position (top
// left), framed, and flipped back.
//
// Licence: this port MIT, like the original (LICENSE-katrain.txt; COPYING.md lists it).
import { BLACK, WHITE } from './goban.ts';

const NEAR_TO_EDGE = 2;
const OFFENCE_TO_WIN = 5;

interface Cell {
  stone?: boolean;
  black?: boolean;
  frame?: boolean;
  regionMark?: boolean;
}

type Stones = Cell[][];
type Sizes = [number, number];
type Range = [number, number, number, number];
type FlipSpec = [boolean, boolean, boolean];

interface Ij {
  i: number;
  j: number;
  black: boolean;
}

export interface Framed {
  /** The whole board with the frame: 0 empty, 1 black, 2 white (goban's colours). */
  board: number[][];
  /** Whether the frame took Black to be the attacker. */
  blackToAttack: boolean;
}

/**
 * The board with a tsumego frame around its stones. `board` is goban's matrix (rows of 0/1/2);
 * `ko` asks for a ko threat for the side that needs it, as KaTrain's `ko_p`.
 */
export function tsumegoFrame(
  board: number[][],
  komi: number,
  blackToPlay: boolean,
  ko = false,
  margin = 2,
): Framed {
  const stones: Stones = board.map(row =>
    row.map(c =>
      c === BLACK ? { stone: true, black: true } : c === WHITE ? { stone: true, black: false } : {},
    ),
  );
  const state = { blackToAttack: false };
  const filled = tsumegoFrameStones(stones, komi, blackToPlay, ko, margin, state);
  return {
    board: filled.map(row => row.map(c => (c.stone ? (c.black ? BLACK : WHITE) : 0))),
    blackToAttack: state.blackToAttack,
  };
}

function tsumegoFrameStones(
  stones: Stones,
  komi: number,
  blackToPlay: boolean,
  ko: boolean,
  margin: number,
  state: { blackToAttack: boolean },
): Stones {
  const sizes = ijSizes(stones);
  const [isize, jsize] = sizes;
  const ijs: Ij[] = [];
  stones.forEach((row, i) =>
    row.forEach((h, j) => {
      if (h.stone) ijs.push({ i, j, black: !!h.black });
    }),
  );
  if (ijs.length === 0) return stones;
  // find range of problem
  const top = minBy(ijs, 'i', +1);
  const left = minBy(ijs, 'j', +1);
  const bottom = minBy(ijs, 'i', -1);
  const right = minBy(ijs, 'j', -1);
  const imin = snap0(top.i);
  const jmin = snap0(left.j);
  const imax = snapS(bottom.i, isize);
  const jmax = snapS(right.j, jsize);
  // flip/rotate for standard position
  // don't mix flip and swap (FF = SS = identity, but SFSF != identity)
  const flipSpec: FlipSpec =
    imin < jmin ? [false, false, true] : [needFlip(imin, imax, isize), needFlip(jmin, jmax, jsize), false];
  if (flipSpec.includes(true)) {
    const flipped = flipStones(stones, flipSpec);
    const filled = tsumegoFrameStones(flipped, komi, blackToPlay, ko, margin, state);
    return flipStones(filled, flipSpec);
  }
  // put outside stones
  const frameRange: Range = [imin - margin, imax + margin, jmin - margin, jmax + margin];
  const blackToAttack = guessBlackToAttack([top, bottom, left, right], sizes);
  state.blackToAttack = blackToAttack;
  putBorder(stones, sizes, frameRange, blackToAttack);
  putOutside(stones, sizes, frameRange, blackToAttack, komi);
  putKoThreat(stones, sizes, frameRange, blackToAttack, blackToPlay, ko);
  return stones;
}

// detect corner/edge/center problems
// (avoid putting border stones on the first lines)
const snap = (k: number, to: number) => (Math.abs(k - to) <= NEAR_TO_EDGE ? to : k);
const snap0 = (k: number) => snap(k, 0);
const snapS = (k: number, size: number) => snap(k, size - 1);

function minBy(ary: Ij[], key: 'i' | 'j', sign: number): Ij {
  const by = ary.map(z => sign * z[key]);
  return ary[by.indexOf(Math.min(...by))];
}

const needFlip = (kmin: number, kmax: number, size: number) => kmin < size - kmax - 1;

function guessBlackToAttack(extrema: Ij[], sizes: Sizes): boolean {
  return extrema.reduce((sum, z) => sum + signOfColor(z) * height2(z, sizes), 0) > 0;
}

const signOfColor = (z: Ij) => (z.black ? 1 : -1);
const height2 = (z: Ij, [isize, jsize]: Sizes) => height(z.i, isize) + height(z.j, jsize);
const height = (k: number, size: number) => size - Math.abs(k - (size - 1) / 2);

// sub

function putBorder(stones: Stones, sizes: Sizes, [i0, i1, j0, j1]: Range, isBlack: boolean): void {
  putTwin(stones, sizes, i0, i1, j0, j1, isBlack, false);
  putTwin(stones, sizes, j0, j1, i0, i1, isBlack, true);
}

function putTwin(
  stones: Stones,
  sizes: Sizes,
  beg: number,
  end: number,
  at0: number,
  at1: number,
  isBlack: boolean,
  reverse: boolean,
): void {
  for (const at of [at0, at1]) {
    for (let k = beg; k <= end; k++) {
      const [i, j] = reverse ? [at, k] : [k, at];
      putStone(stones, sizes, i, j, isBlack, false, true);
    }
  }
}

function putOutside(
  stones: Stones,
  sizes: Sizes,
  frameRange: Range,
  blackToAttack: boolean,
  komi: number,
): void {
  const [isize, jsize] = sizes;
  let count = 0;
  const offenseKomi = (blackToAttack ? +1 : -1) * komi;
  const defenseArea = (isize * jsize - offenseKomi - OFFENCE_TO_WIN) / 2;
  for (let i = 0; i < isize; i++) {
    for (let j = 0; j < jsize; j++) {
      if (insideP(i, j, frameRange)) continue;
      count += 1;
      const blackP = xor(blackToAttack, count <= defenseArea);
      const emptyP = (i + j) % 2 === 0 && Math.abs(count - defenseArea) > isize;
      putStone(stones, sizes, i, j, blackP, emptyP);
    }
  }
}

// standard position:
// ? = problem, X = offense, O = defense
// OOOOOOOOOOOOO
// OOOOOOOOOOOOO
// OOOOOOOOOOOOO
// XXXXXXXXXXXXX
// XXXXXXXXXXXXX
// XXXX.........
// XXXX.XXXXXXXX
// XXXX.X???????
// XXXX.X???????

// (pattern, top_p, left_p)
const OFFENSE_KO_THREAT: [string, boolean, boolean] = ['\n....OOOX.\n.....XXXX\n', true, false];
const DEFENSE_KO_THREAT: [string, boolean, boolean] = ['\n..\n..\nX.\nXO\nOO\n.O\n', false, true];

function putKoThreat(
  stones: Stones,
  sizes: Sizes,
  frameRange: Range,
  blackToAttack: boolean,
  blackToPlay: boolean,
  ko: boolean,
): void {
  const [isize, jsize] = sizes;
  const forOffense = xor(ko, xor(blackToAttack, blackToPlay));
  const [pattern, topP, leftP] = forOffense ? OFFENSE_KO_THREAT : DEFENSE_KO_THREAT;
  const aa = pattern
    .split('\n')
    .filter(line => line.length > 0)
    .map(line => [...line]);
  const [h, w] = [aa.length, aa[0].length];
  for (let i = 0; i < aa.length; i++) {
    for (let j = 0; j < aa[i].length; j++) {
      const ch = aa[i][j];
      const ai = i + (topP ? 0 : isize - h);
      const aj = j + (leftP ? 0 : jsize - w);
      if (insideP(ai, aj, frameRange)) return;
      const black = xor(blackToAttack, ch === 'O');
      const empty = ch === '.';
      putStone(stones, sizes, ai, aj, black, empty);
    }
  }
}

const xor = (a: boolean, b: boolean) => a !== b;

// util

function flipStones(stones: Stones, flipSpec: FlipSpec): Stones {
  const swap = flipSpec[2];
  const sizes = ijSizes(stones);
  const [isize, jsize] = sizes;
  const [newIsize, newJsize] = swap ? [jsize, isize] : [isize, jsize];
  const out: Stones = Array.from({ length: newIsize }, () =>
    Array.from({ length: newJsize }, (): Cell => ({})),
  );
  stones.forEach((row, i) =>
    row.forEach((z, j) => {
      const [ni, nj] = flipIj([i, j], sizes, flipSpec);
      out[ni][nj] = z;
    }),
  );
  return out;
}

function putStone(
  stones: Stones,
  [isize, jsize]: Sizes,
  i: number,
  j: number,
  black: boolean,
  empty: boolean,
  regionMark = false,
): void {
  if (i < 0 || isize <= i || j < 0 || jsize <= j) return;
  stones[i][j] = empty ? {} : { stone: true, frame: true, black, regionMark };
}

const insideP = (i: number, j: number, [i0, i1, j0, j1]: Range) => i0 <= i && i <= i1 && j0 <= j && j <= j1;

const ijSizes = (stones: unknown[][]): Sizes => [stones.length, stones[0].length];

function flipIj(
  [i, j]: [number, number],
  [isize, jsize]: Sizes,
  [flipI, flipJ, swapIj]: FlipSpec,
): [number, number] {
  const fi = flip1(i, isize, flipI);
  const fj = flip1(j, jsize, flipJ);
  return swapIj ? [fj, fi] : [fi, fj];
}

const flip1 = (k: number, size: number, flag: boolean) => (flag ? size - 1 - k : k);
