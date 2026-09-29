// Turns a solved position into goban's puzzle tree (`MoveTreeJson`, ADR 0025 §1):
//   - at every player node, every winning move, each with its own subtree (goban marks a move that
//     isn't in the tree as wrong, so a missing winning move would be marked wrong);
//   - at every opponent node, the replies that resist longest (goban picks one at random);
//   - a line of right play ends with `correct_answer` once the result is settled: the opponent
//     can't change it even with two moves in a row;
//   - up to 6 plausible wrong first moves, each followed by the opponent's refutation marked
//     `wrong_answer`.
// A position whose tree would be too big, too deep, or rests on an unknown (ko) line is dropped
// with the reason.
//
// Licence: MIT (LiGo's own code, ADR 0007).
import { BLACK, WHITE, type Colour, type Point } from './goban.ts';
import type { Position } from './position.ts';
import { Solver, type SolverLimits, DEFAULT_LIMITS } from './solver.ts';

/** goban's `MoveTreeJson` (goban-engine 8.3.226, engine/MoveTree.d.ts), the fields LiGo uses. */
export interface MoveTreeJson {
  x: number;
  y: number;
  branches?: MoveTreeJson[];
  correct_answer?: boolean;
  wrong_answer?: boolean;
  text?: string;
}

export interface TreeLimits {
  maxPlies: number;
  maxNodes: number;
  maxRightFirstMoves: number;
  maxWrongFirstMoves: number;
  maxRepliesKept: number;
}

export const DEFAULT_TREE_LIMITS: TreeLimits = {
  maxPlies: 15,
  maxNodes: 300,
  maxRightFirstMoves: 3,
  maxWrongFirstMoves: 6,
  maxRepliesKept: 3,
};

export interface Built {
  goal: 'live' | 'kill';
  player: Colour;
  tree: MoveTreeJson;
  rightFirstMoves: number;
  wrongFirstMoves: number;
  /** Plies in the longest line of right play. */
  depth: number;
  nodes: number;
  solverNodes: number;
}

export class Dropped extends Error {}

export function buildPuzzle(
  pos: Position,
  player: Colour,
  limits: TreeLimits = DEFAULT_TREE_LIMITS,
  solverLimits: SolverLimits = DEFAULT_LIMITS,
): Built {
  const opponent: Colour = player === BLACK ? WHITE : BLACK;
  const mine = player === pos.defender ? 'defender' : 'attacker';
  const goal = mine === 'defender' ? 'live' : 'kill';

  // Unsettled: the side to move wins, and the other side would win if it moved first.
  const other = new Solver(pos, opponent, solverLimits);
  const otherValue = other.solve();
  if (otherValue !== (mine === 'defender' ? 'attacker' : 'defender')) {
    throw new Dropped(
      otherValue === 'unknown' ? 'unknown with the other side to move' : 'settled: no puzzle',
    );
  }

  const s = new Solver(pos, player, solverLimits);
  s.startClock();
  if (s.terminal()) throw new Dropped('already decided');
  let nodes = 0;
  let deepest = 0;
  const count = () => {
    if (++nodes > limits.maxNodes) throw new Dropped(`tree over ${limits.maxNodes} nodes`);
  };

  /** Whether the result can't change even if the side to move (the opponent) plays twice. */
  const settled = (): boolean => {
    if (s.terminal() === mine) return true;
    for (const r of s.candidates()) {
      const m = s.move(r);
      if (m === false) continue;
      if (m === 'unknown') return false;
      s.forcePass();
      const v = s.valueAfter(null, 2);
      s.back();
      s.back();
      if (v !== mine && v !== 'illegal') return false;
    }
    return true;
  };

  /** Winning moves for the player here, each with its subtree; the ply is the player's move. */
  const playerMoves = (ply: number): MoveTreeJson[] => {
    const out: MoveTreeJson[] = [];
    for (const at of s.candidates()) {
      const v = s.valueAfter(at);
      if (v === 'unknown') throw new Dropped('a player move rests on an unknown (ko) line');
      if (v !== mine) continue;
      count();
      s.move(at);
      try {
        out.push({ x: at.x, y: at.y, ...afterPlayer(ply) });
      } finally {
        s.back();
      }
    }
    return out;
  };

  /** What follows the player's move at `ply`: settled, or the opponent's longest resistance. */
  const afterPlayer = (ply: number): Partial<MoveTreeJson> => {
    deepest = Math.max(deepest, ply);
    if (ply > limits.maxPlies) throw new Dropped(`deeper than ${limits.maxPlies} plies`);
    if (settled()) return { correct_answer: true };
    const replies: { node: MoveTreeJson; depth: number }[] = [];
    for (const r of s.candidates()) {
      const m = s.move(r);
      if (m === false) continue;
      if (m === 'unknown') throw new Dropped('an opponent reply makes a ko');
      try {
        const before = deepest;
        deepest = ply + 1;
        count();
        const branches = playerMoves(ply + 2);
        if (branches.length === 0) throw new Dropped('no winning answer to a reply (unsound)');
        replies.push({ node: { x: r.x, y: r.y, branches }, depth: deepest });
        deepest = Math.max(before, deepest);
      } finally {
        s.back();
      }
    }
    // Only passes are left for the opponent: nothing more to show.
    if (replies.length === 0) return { correct_answer: true };
    const longest = Math.max(...replies.map(r => r.depth));
    const kept = replies.filter(r => r.depth === longest).slice(0, limits.maxRepliesKept);
    return { branches: kept.map(r => r.node) };
  };

  const right: Point[] = [];
  const wrong: Point[] = [];
  for (const at of s.candidates()) {
    const v = s.valueAfter(at);
    if (v === 'illegal') continue;
    if (v === 'unknown') throw new Dropped('a first move rests on an unknown (ko) line');
    (v === mine ? right : wrong).push(at);
  }
  if (right.length === 0) throw new Dropped('no winning first move (unsound)');
  if (right.length > limits.maxRightFirstMoves)
    throw new Dropped(`${right.length} right first moves: too easy`);

  const branches = playerMoves(1);
  const depth = deepest;

  for (const w of wrong.slice(0, limits.maxWrongFirstMoves)) {
    count();
    s.move(w);
    try {
      let refutation: MoveTreeJson | null = null;
      for (const r of s.candidates()) {
        if (s.valueAfter(r) === (mine === 'defender' ? 'attacker' : 'defender')) {
          refutation = { x: r.x, y: r.y, wrong_answer: true };
          break;
        }
      }
      branches.push(
        refutation ? { x: w.x, y: w.y, branches: [refutation] } : { x: w.x, y: w.y, wrong_answer: true },
      );
    } finally {
      s.back();
    }
  }

  return {
    goal,
    player,
    tree: { x: -1, y: -1, branches },
    rightFirstMoves: right.length,
    wrongFirstMoves: wrong.length,
    depth,
    nodes,
    solverNodes: s.nodes + other.nodes,
  };
}
