import { formatPoints, initialState, type Board } from './board.ts';
import { widenToChains } from './chains.ts';
// Dead-stone proposals and counting (ADR 0016, ADR 0020 §1, docs/rules/spec.md §8): KataGo's two
// ownership maps feed goban-engine's `autoscore`, which picks the dead stones; every count
// (proposal or recount) goes through `GobanEngine.computeScore()`, which is goscorer.
//
// Licence: MIT (LiGo's own code, ADR 0006).
import { GobanEngine, autoscore, char2num, type GobanRules, type JGOFMove, type Score } from './goban.ts';
import type { OwnershipMaps } from './katago.ts';

export type Ruleset = 'j' | 'c';
export interface Prisoners {
  b: number;
  w: number;
}

export interface SideScore {
  territory: number;
  stones: number;
  prisoners: number;
  total: number;
}
export interface WhiteScore extends SideScore {
  komi: number;
  compensation: number;
}
export interface ScoreReply {
  dead: string[];
  seal: string[];
  owner: string;
  score: { b: SideScore; w: WhiteScore };
}

function fullRules(rules: Ruleset): GobanRules {
  return rules === 'j' ? 'japanese' : 'chinese';
}

// goban-engine 8.3.226 gives White 1 point of compensation for `handicap: 1` (its Chinese-rules
// `getHandicapPointAdjustmentForWhite` returns the raw handicap count with no AGA "-1" step,
// checked against the vendored source at the pinned version); R-HCP-2 places no handicap stone
// for a 1-stone game and R-KOMI-3 gives it no compensation. This package never passes a handicap
// of 1 to GobanEngine, whatever a caller sends (ADR 0020 §1; test/handicap.test.ts pins this).
export function effectiveHandicap(handicap: number): number {
  return handicap < 2 ? 0 : handicap;
}

/** Decodes goban-engine's `scoring_positions` (points concatenated as two-letter SGF
 * coordinates, the same encoding `autoscore`'s `removed`/`needs_sealing` use) into an owner
 * string: one character per point, row by row, `b`/`w` for a point counted for that colour,
 * `.` for everyone else (ADR 0020 §1). */
function ownerString(size: number, blackPositions: string, whitePositions: string): string {
  const owner: string[][] = Array.from({ length: size }, () => Array(size).fill('.'));
  const mark = (positions: string, ch: string) => {
    for (let i = 0; i < positions.length; i += 2) {
      const x = char2num(positions[i]);
      const y = char2num(positions[i + 1]);
      owner[y][x] = ch;
    }
  };
  mark(blackPositions, 'b');
  mark(whitePositions, 'w');
  return owner.map(row => row.join('')).join('');
}

/** Runs goscorer (via `GobanEngine.computeScore`) on a board with a given dead-stone set, and
 * builds the ADR 0020 `score` and `owner` fields. `playPrisoners` are the stones captured during
 * play (go-rules' `Captures`), added on top of goscorer's own count of stones removed as dead
 * (R-SCORE-J1); komi and handicap compensation are goban-engine's (R-KOMI, R-SCORE-4). */
export function countGiven(
  board: Board,
  rules: Ruleset,
  komi: number,
  handicap: number,
  dead: JGOFMove[],
  playPrisoners: Prisoners,
): { owner: string; score: { b: SideScore; w: WhiteScore } } {
  const size = board.length;
  const engine = new GobanEngine({
    width: size,
    height: size,
    rules: fullRules(rules),
    initial_state: initialState(board),
    komi,
    handicap: effectiveHandicap(handicap),
    removed: dead,
  });
  const cs: Score = engine.computeScore();
  const owner = ownerString(size, cs.black.scoring_positions, cs.white.scoring_positions);
  const score = {
    b: {
      territory: cs.black.territory,
      stones: cs.black.stones,
      prisoners: cs.black.prisoners + playPrisoners.b,
      total: cs.black.total + playPrisoners.b,
    },
    w: {
      territory: cs.white.territory,
      stones: cs.white.stones,
      prisoners: cs.white.prisoners + playPrisoners.w,
      komi: cs.white.komi,
      compensation: cs.white.handicap,
      total: cs.white.total + playPrisoners.w,
    },
  };
  return { owner, score };
}

/** The dead-stone proposal from KataGo's two ownership maps (memo 1.3): `autoscore` picks the
 * dead stones and the points that still need sealing, widened to whole chains before counting
 * (ADR 0020 §1). */
export function proposeFromOwnership(
  board: Board,
  rules: Ruleset,
  ownership: OwnershipMaps,
  komi: number,
  handicap: number,
  playPrisoners: Prisoners,
): ScoreReply {
  const [res] = autoscore(board, fullRules(rules), ownership.blackToMove, ownership.whiteToMove);
  const dead = widenToChains(board, res.removed);
  const deadKeys = new Set(dead.map(p => `${p.x},${p.y}`));
  const seal = res.needs_sealing.filter(p => !deadKeys.has(`${p.x},${p.y}`));
  const { owner, score } = countGiven(board, rules, komi, handicap, dead, playPrisoners);
  return { dead: formatPoints(dead), seal: formatPoints(seal), owner, score };
}

/** Nothing marked dead: the no-KataGo fallback (ADR 0020 §4) and a starting point players mark
 * by hand. */
export function noneDead(
  board: Board,
  rules: Ruleset,
  komi: number,
  handicap: number,
  playPrisoners: Prisoners,
): ScoreReply {
  const { owner, score } = countGiven(board, rules, komi, handicap, [], playPrisoners);
  return { dead: [], seal: [], owner, score };
}
