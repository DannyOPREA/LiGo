// "View the solution" (unit 8.7, ADR 0025 §3): the puzzle's first line of right play, replayed
// into 7.2's Go nodes (libs/board's `readTree` and `playFrom`, LiGo's rules settings) so the move
// list and the board show each position the rules give. Nothing is judged here: goban's puzzle mode
// decides right and wrong; this only lays out a line the generator already wrote into the tree.
// Licence: AGPL-3.0-or-later, like the rest of lila.

import { playFrom, readTree, type GoNode, type GoRoot } from '@ligo/board/sgf';

import type { MoveTree, PuzzleJson } from './interfaces';

/** The SGF point of a node of goban's tree: two letters, column then row from the top left. */
const point = (n: { x: number; y: number }): string => String.fromCharCode(97 + n.x, 97 + n.y);

/**
 * The points of the first line that ends on a `correct_answer` node, the player's moves and the
 * replies alike, in order. Branches are tried in the order the tree lists them; a line that ends
 * on `wrong_answer` (a refutation) is skipped. Undefined when the tree has no right line.
 */
export function solutionPoints(tree: MoveTree): string[] | undefined {
  const walk = (node: MoveTree): string[] | undefined => {
    if (node.wrong_answer) return undefined;
    const here = node.x >= 0 ? [point(node)] : [];
    if (node.correct_answer) return here;
    for (const branch of node.branches ?? []) {
      const rest = walk(branch);
      if (rest) return [...here, ...rest];
    }
    return undefined;
  };
  return walk(tree);
}

/** The setup as an SGF root for `readTree`, which checks it as it checks any file's root. */
export function puzzleSgf(puzzle: PuzzleJson): string {
  const list = (key: 'AB' | 'AW', points: string) => {
    const pts = points.match(/../g) ?? [];
    return pts.length ? `${key}${pts.map(p => `[${p}]`).join('')}` : '';
  };
  return (
    `(;GM[1]FF[4]CA[UTF-8]SZ[${puzzle.width}]RU[Japanese]KM[0]` +
    list('AB', puzzle.initial_state.black) +
    list('AW', puzzle.initial_state.white) +
    `PL[${puzzle.initial_player === 'white' ? 'W' : 'B'}])`
  );
}

/** The solution: the root, then each move of the line with the position after it. */
export type Solution = [GoRoot, ...GoNode[]];

/**
 * The puzzle's right line as Go nodes, or undefined when the tree has none or the rules refuse a
 * move of it (which a generated puzzle never does: the checker in tools/puzzles replays it).
 */
export function buildSolution(puzzle: PuzzleJson): Solution | undefined {
  const points = solutionPoints(puzzle.move_tree);
  if (!points?.length) return undefined;
  let line: Solution;
  try {
    line = [readTree(puzzleSgf(puzzle))];
  } catch (e) {
    console.error(e);
    return undefined;
  }
  for (const move of points) {
    const played = playFrom(line, move);
    if (!('node' in played)) return undefined;
    line.push(played.node);
  }
  return line;
}

/** Column letters as printed on a Go board: no I. */
const LETTERS = 'ABCDEFGHJKLMNOPQRSTUVWXYZ';

/** "D16" for an SGF point on a board of `size` (rows counted from the bottom). */
export const pointName = (size: number, move: string): string =>
  `${LETTERS[move.charCodeAt(0) - 97]}${size - (move.charCodeAt(1) - 97)}`;

/** The puzzle as goban shows a position of the solution: no tree, so nothing is right or wrong. */
export function positionPuzzle(puzzle: PuzzleJson, node: GoNode): PuzzleJson {
  return {
    ...puzzle,
    initial_state: { black: node.stones.black.join(''), white: node.stones.white.join('') },
    initial_player: node.toMove,
    move_tree: { x: -1, y: -1 },
  };
}
