// A test helper for the puzzle and SGF tests: the straight three in the corner as a puzzle.
import { BLACK, sgfPoint } from '../src/goban.ts';
import { parseDiagram, place } from '../src/position.ts';
import type { Puzzle } from '../src/puzzle.ts';
import { buildPuzzle } from '../src/tree.ts';

const STRAIGHT_THREE = place(parseDiagram('. . . X O -\nX X X X O -\nO O O O O -\n- - - - - -'), 19, BLACK);

export function straightThree(): Puzzle {
  const built = buildPuzzle(STRAIGHT_THREE, BLACK);
  return {
    id: 'abc12',
    width: 19,
    height: 19,
    bounds: { top: 0, left: 0, bottom: 4, right: 6 },
    initial_state: {
      black: STRAIGHT_THREE.black.map(sgfPoint).join(''),
      white: STRAIGHT_THREE.white.map(sgfPoint).join(''),
    },
    initial_player: 'black',
    move_tree: built.tree,
    puzzle_player_move_mode: 'free',
    puzzle_opponent_move_mode: 'automatic',
    goal: 'live',
    themes: ['lifeAndDeath', 'living', 'corner', 'eyeShape'],
    rating: 800,
    provenance: {
      source: 'generated',
      generator: '@ligo/puzzles',
      version: '1',
      seed: 1,
      shape: 'straight three',
      anchor: 'corner',
      variation: 'plain',
      orientation: 0,
      katago: { version: '1.18.1', network: 'test.bin.gz', sha256: 'a'.repeat(64), visits: 1 },
    },
  };
}
