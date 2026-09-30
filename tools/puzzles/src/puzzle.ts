import ajvModule from 'ajv/dist/2020.js';
// A puzzle on disk (ADR 0025 §1): goban's `PuzzleConfig` plus LiGo's fields, checked against
// schema/puzzle.schema.json and then replayed on goban-engine. `check` is what every puzzle must
// pass before it is written or loaded: generated ones, and the hand-transcribed classics.
//
// Licence: MIT (LiGo's own code, ADR 0007).
import { readFileSync } from 'node:fs';

import { createEngine, fromSgf, play, undo, type Point } from './goban.ts';
import { chainAt } from './position.ts';
import type { MoveTreeJson } from './tree.ts';

export type Goal = 'live' | 'kill' | 'ko' | 'capture' | 'connect';

export type Theme =
  | 'lifeAndDeath'
  | 'living'
  | 'killing'
  | 'ko'
  | 'capturingRace'
  | 'tesuji'
  | 'eyeShape'
  | 'snapback'
  | 'throwIn'
  | 'corner'
  | 'edge'
  | 'centre';

export interface KataGoCheck {
  version: string;
  network: string;
  sha256: string;
  visits: number;
}

export interface Generated {
  source: 'generated';
  generator: '@ligo/puzzles';
  version: string;
  seed: number;
  shape: string;
  anchor: 'corner' | 'edge' | 'centre';
  variation: string;
  orientation: number;
  katago: KataGoCheck;
}

export interface Transcribed {
  source: 'transcribed';
  work: string;
  edition: string;
  library_id?: string;
  problem: string;
  scan_url: string;
  page: string;
  rights: string;
  transcriber: string;
  checker: string;
}

export interface Bounds {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

export interface Puzzle {
  id: string;
  width: 9 | 13 | 19;
  height: 9 | 13 | 19;
  bounds: Bounds;
  initial_state: { black: string; white: string };
  initial_player: 'black' | 'white';
  move_tree: MoveTreeJson;
  puzzle_player_move_mode: 'free' | 'fixed';
  puzzle_opponent_move_mode: 'automatic';
  goal: Goal;
  themes: Theme[];
  rating: number;
  provenance: Generated | Transcribed;
}

export const SCHEMA_PATH = new URL('../schema/puzzle.schema.json', import.meta.url);

interface Validator {
  (data: unknown): boolean;
  errors?: { instancePath: string; message?: string }[] | null;
}
interface AjvLike {
  compile(schema: unknown): Validator;
}
const Ajv = (ajvModule as unknown as { default: new (o: { allErrors: boolean; strict: boolean }) => AjvLike })
  .default;

let validator: Validator | null = null;

/** The schema's complaints about `data`, empty when it fits. */
export function schemaErrors(data: unknown): string[] {
  validator ??= new Ajv({ allErrors: true, strict: true }).compile(
    JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')),
  );
  if (validator(data)) return [];
  return (validator.errors ?? []).map(e => `${e.instancePath || '/'} ${e.message ?? 'is invalid'}`);
}

export const LIMITS = { maxPlies: 15, maxNodes: 300 };

const points = (s: string): Point[] => (s.match(/../g) ?? []).map(fromSgf);

/**
 * Everything wrong with a puzzle, empty when it can be used (ADR 0025 §1, PLAN unit 8.3): the
 * schema, the board and bounds, the setup stones, and every line of the tree replayed with LiGo's
 * rules (an illegal move, a suicide, a line that marks neither right nor wrong, no right answer).
 */
export function check(data: unknown): string[] {
  const errors = schemaErrors(data);
  if (errors.length) return errors;
  const p = data as Puzzle;
  const size = p.width;
  if (p.height !== size) return ['the board must be square'];
  const b = p.bounds;
  if (b.top > b.bottom || b.left > b.right || b.bottom >= size || b.right >= size)
    return ['bounds outside the board'];
  const inBounds = (q: Point) => q.x >= b.left && q.x <= b.right && q.y >= b.top && q.y <= b.bottom;

  const black = points(p.initial_state.black);
  const white = points(p.initial_state.white);
  const board = Array.from({ length: size }, () => Array.from({ length: size }, () => 0));
  for (const [stones, colour] of [
    [black, 1],
    [white, 2],
  ] as const) {
    for (const q of stones) {
      if (q.x >= size || q.y >= size) return [`setup stone ${q.x},${q.y} is off the board`];
      if (board[q.y][q.x]) return [`two setup stones on ${q.x},${q.y}`];
      board[q.y][q.x] = colour;
    }
  }
  for (const q of [...black, ...white]) {
    if (chainAt(board, q, size).liberties.length === 0)
      return [`setup stones at ${q.x},${q.y} have no liberties`];
  }

  const problems: string[] = [];
  const engine = createEngine(size, black, white, p.initial_player);
  let nodes = 0;
  let rights = 0;
  const walk = (node: MoveTreeJson, ply: number, path: string) => {
    if (node.correct_answer && node.wrong_answer) problems.push(`${path}: both right and wrong`);
    const kids = node.branches ?? [];
    if (kids.length === 0 && ply > 0 && !node.correct_answer && !node.wrong_answer) {
      problems.push(`${path}: the line ends without saying right or wrong`);
    }
    if (kids.length > 0 && (node.correct_answer || node.wrong_answer)) {
      problems.push(`${path}: the line goes on after right or wrong`);
    }
    if (node.correct_answer) {
      if (ply % 2 === 0) problems.push(`${path}: a right answer after the opponent's move`);
      else rights++;
    }
    if (ply > LIMITS.maxPlies) problems.push(`${path}: deeper than ${LIMITS.maxPlies} plies`);
    const seen = new Set<string>();
    for (const k of kids) {
      const here = `${path} ${k.x},${k.y}`;
      if (seen.has(`${k.x},${k.y}`)) problems.push(`${here}: the same move twice`);
      seen.add(`${k.x},${k.y}`);
      if (!inBounds(k)) problems.push(`${here}: outside the bounds`);
      nodes++;
      const r = play(engine, k);
      if ('refused' in r) {
        problems.push(`${here}: illegal (${r.refused})`);
        continue;
      }
      walk(k, ply + 1, here);
      undo(engine);
    }
  };
  walk(p.move_tree, 0, 'tree');
  if (nodes > LIMITS.maxNodes) problems.push(`the tree has ${nodes} nodes, over ${LIMITS.maxNodes}`);
  if (rights === 0) problems.push('no right answer');
  return problems;
}
