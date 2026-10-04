// The Go facts the analysis board shows and works from (unit 7.4, ADR 0023 §1): point names, the
// board's setup for a line of the tree, the sounds, and a new position as an SGF root. No rules
// here: libs/board's `readTree` and `playFrom` replay every move with LiGo's settings.
// Licence: MIT (LiGo's own code, ADR 0006).

import type { BoardConfig } from '@ligo/board/board';
import type { GoNode, GoRoot, SgfSettings } from '@ligo/board/sgf';

export type Size = SgfSettings['size'];
export type Ruleset = SgfSettings['ruleset'];

export const SIZES: Size[] = [9, 13, 19];

/** Column letters as printed on a Go board: no I. */
const LETTERS = 'ABCDEFGHJKLMNOPQRSTUVWXYZ';

/** The tree's pass: two characters, as lila's tree paths need (libs/board `GoNode`). */
export const PASS = '..';

/** "D16" for an SGF point on a board of `size` (rows counted from the bottom), "Pass" for a pass. */
export function pointName(size: number, move: string): string {
  if (move === PASS || move === 'pass' || move === '') return 'Pass';
  return `${LETTERS[move.charCodeAt(0) - 97]}${size - (move.charCodeAt(1) - 97)}`;
}

/** A node as the move list names it: "Pass", "D16"; the root has no name. */
export const moveName = (size: number, node: GoNode): string =>
  node.move === null ? '' : pointName(size, node.move);

/** A node's full name, for the move list's menu: "12. Black D16", or "Start" at the root. */
export const nodeFullName = (size: number, node: GoNode): string =>
  node.move === null
    ? 'Start'
    : `${node.ply}. ${node.color === 'white' ? 'White' : 'Black'} ${moveName(size, node)}`;

/** libs/board's move for a node's move: an SGF point or "pass". */
export const boardMove = (move: string): string => (move === PASS ? 'pass' : move);

/** The tree's move for libs/board's: an SGF point or "..". */
export const treeMove = (move: string): string => (move === 'pass' ? PASS : move);

/** The board for the end of `line` (the root, then each node down): the root's stones, then the moves. */
export function boardSetup(
  line: [GoRoot, ...GoNode[]],
): Pick<BoardConfig, 'size' | 'ruleset' | 'komi' | 'handicap' | 'stones' | 'toMove' | 'moves'> {
  const [root, ...moves] = line;
  const s = root.settings;
  return {
    size: s.size,
    ruleset: s.ruleset,
    komi: s.komi,
    handicap: s.handicap,
    stones: { black: s.black, white: s.white },
    toMove: s.toMove,
    moves: moves.map(n => boardMove(n.move!)),
  };
}

/** Stones `node` took, beyond what its parent's position had taken (0 for a pass). */
export const capturedBy = (parent: GoNode, node: GoNode): number =>
  node.color ? node.captures[node.color] - parent.captures[node.color] : 0;

/** lila's sound for a move, as the round page plays it (ui/round `soundOf`). */
export const soundOf = (move: string, captured: number): string =>
  move === PASS ? 'confirmation' : captured > 0 ? 'capture' : 'move';

/** A new position the page's setup mode builds. */
export interface NewPosition {
  size: Size;
  ruleset: Ruleset;
  komi: number;
  black: string[];
  white: string[];
  toMove: 'black' | 'white';
}

/** The SGF root of a new position, for `readTree`, which checks it as it checks any file's root. */
export function positionSgf(p: NewPosition): string {
  const list = (points: string[]) => points.map(pt => `[${pt}]`).join('');
  return (
    `(;GM[1]FF[4]CA[UTF-8]SZ[${p.size}]RU[${p.ruleset === 'chinese' ? 'Chinese' : 'Japanese'}]` +
    `KM[${p.komi}]` +
    (p.black.length ? `AB${list(p.black)}` : '') +
    (p.white.length ? `AW${list(p.white)}` : '') +
    `PL[${p.toMove === 'white' ? 'W' : 'B'}])`
  );
}

/** "19×19 · Japanese · komi 6.5", the game the tree is played under. */
export function settingsText(s: SgfSettings): string {
  const rules = s.ruleset === 'chinese' ? 'Chinese' : 'Japanese';
  return [
    `${s.size}×${s.size}`,
    rules,
    `komi ${s.komi}`,
    ...(s.handicap >= 2 ? [`${s.handicap} handicap stones`] : []),
  ].join(' · ');
}
