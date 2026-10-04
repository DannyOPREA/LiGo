// A Go game as the server sends it (ADR 0019 §6, unit 3.13) and the plain facts the round page
// derives from it: the steps of the move list, point names, the board's starting setup, the result.
// No rules here: the board (libs/board, goban) knows the legal points and the server is the referee.
// Licence: MIT (LiGo's own code, ADR 0006).

import type { Game as BoardGame } from '@ligo/board/board';
import { handicapStones } from '@ligo/board/rules';

import type { Status } from 'lib/game';

import type { GoData, GoMoveEvent, RoundData, Step } from './interfaces';

const LETTERS = 'ABCDEFGHJKLMNOPQRSTUVWXYZ';

/**
 * An SGF point (`"dd"`, column then row from the top left) as printed on the board ("D16" on
 * 19×19: letters without I, rows counted from the bottom), or "Pass". The same names as the
 * board's keyboard and screen-reader words (libs/board `src/access.ts`, not exported).
 */
export function moveName(size: number, move: string): string {
  if (move === 'pass') return i18n.site.goPass;
  return `${LETTERS[move.charCodeAt(0) - 97]}${size - (move.charCodeAt(1) - 97)}`;
}

/**
 * The plies of the game, in order: stones (SGF points) and passes. Resuming play from the scoring
 * phase isn't a ply (ADR 0019 §3), so it isn't listed.
 */
export const playedMoves = (go: GoData): string[] =>
  go.moves.split(' ').filter(m => m !== '' && m !== 'resume');

/** The move a `move` event carries. */
export const eventMove = (e: GoMoveEvent): string => e.p ?? 'pass';

/**
 * The move list's steps: the starting position at the game's first ply (1 when Black moves first,
 * 0 when White does, ADR 0019 §3), then one step per move.
 */
export function stepsOf(go: GoData, firstPly: number): Step[] {
  const steps: Step[] = [{ ply: firstPly, uci: '', san: '' }];
  playedMoves(go).forEach((move, i) => steps.push(stepOf(go.size, firstPly + i + 1, move)));
  return steps;
}

export const stepOf = (size: number, ply: number, move: string): Step => ({
  ply,
  uci: move,
  san: moveName(size, move),
});

/**
 * The board's starting setup: a custom position when the game has one, else the handicap stones
 * at the spec's fixed points (R-HCP-4, the same table the server uses) with White to move, else an
 * empty board with Black to move.
 */
export function boardGame(go: GoData): BoardGame {
  const handicap = go.handicap ?? 0;
  const base = { size: go.size, ruleset: go.rules, komi: go.komi, handicap };
  if (go.position)
    return {
      ...base,
      stones: { black: go.position.black, white: go.position.white },
      toMove: go.position.toMove,
    };
  if (handicap >= 2)
    return { ...base, stones: { black: handicapStones(go.size, handicap), white: [] }, toMove: 'white' };
  return { ...base, stones: { black: [], white: [] }, toMove: 'black' };
}

const letter = (c: Color) => (c === 'black' ? 'B' : 'W');

/**
 * The result in Go's usual short form: "B+3.5" or "W+0.5" by counting (ADR 0020 §5, the server's
 * `result`), "Jigo" for an even count, "B+R" (White resigned), "W+T" (Black ran out of time), "B+F"
 * (forfeit: the opponent left or never moved). A game that ended without a count it could trust (the
 * scoring service never answered, ADR 0020 §4) has no result.
 */
export function resultText(status: Status, winner: Color | undefined, result?: string): string | undefined {
  if (status.name === 'aborted' || status.name === 'started' || status.name === 'created') return undefined;
  if (status.name === 'variantEnd')
    return result === '0' ? 'Jigo' : (result ?? (winner ? `${letter(winner)}+?` : 'Jigo'));
  if (!winner) return i18n.site.goNoResult;
  const how = status.name === 'resign' ? 'R' : status.name === 'outoftime' ? 'T' : 'F';
  return `${letter(winner)}+${how}`;
}

/**
 * The words under the result, for Go's own endings, which lila's status text doesn't know: a game
 * decided by counting, and one that ended with no result. Anything else is lila's usual text.
 */
export function goStatusText(d: RoundData): string | undefined {
  const { status, winner, result } = d.game;
  if (status.name === 'variantEnd') {
    if (result === '0' || (!result && !winner)) return i18n.site.goJigo;
    const margin = result ? parseFloat(result.slice(2)) : NaN;
    if (winner && !isNaN(margin)) return i18n.site.goXWinsByNbPoints(margin, i18n.site[winner]);
    return undefined;
  }
  if (status.name === 'unknownFinish' && !winner) return i18n.site.goScoreNotCounted;
  return undefined;
}

/** `Pref.ConfirmMoves` (lila/modules/pref), as the playground resolves it (unit 2.3). */
const ConfirmMoves = { NEVER: 0, TOUCH: 1, ALWAYS: 2 } as const;

/** Whether taps only preview the stone, for a `Pref.ConfirmMoves` value on this kind of device. */
export const resolveConfirm = (confirmMoves: number | undefined, touch: boolean): boolean => {
  const pref = confirmMoves ?? ConfirmMoves.TOUCH;
  return pref === ConfirmMoves.ALWAYS || (pref === ConfirmMoves.TOUCH && touch);
};

/** One of lila's sounds for a move that counted (ADR 0026 §2, as the playground plays them). */
export const soundOf = (move: string, captured: number): string =>
  move === 'pass' ? 'confirmation' : captured > 0 ? 'capture' : 'move';
