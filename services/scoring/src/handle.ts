// Request handling (ADR 0020 §1): `propose` (KataGo's two ownership maps, autoscore, falling
// back to `src: "none"` when KataGo is missing, errors or times out) and `count` (goscorer only,
// the given dead stones, which must already be whole chains). No Redis here (that's unit 4.5):
// `handle(message)` is the whole surface, used by the CLI and, later, by the Redis worker.
//
// Licence: MIT (LiGo's own code, ADR 0006).
import { parseBoard, parsePoints } from './board.ts';
import { isWholeChains } from './chains.ts';
import { KataGoUnavailable, type KataGoClient } from './katago.ts';
import {
  noneDead,
  proposeFromOwnership,
  countGiven,
  type Prisoners,
  type Ruleset,
  type ScoreReply,
} from './score.ts';

export interface ProposeRequest {
  t: 'propose';
  ref: string;
  size: number;
  rules: Ruleset;
  komi: number;
  handicap: number;
  board: string;
  toMove?: 'b' | 'w';
  prisoners: Prisoners;
}
export interface CountRequest {
  t: 'count';
  ref: string;
  size: number;
  rules: Ruleset;
  komi: number;
  handicap: number;
  board: string;
  toMove?: 'b' | 'w';
  prisoners: Prisoners;
  dead: string[];
}
export type Request = ProposeRequest | CountRequest;

export interface ProposalReply extends ScoreReply {
  t: 'proposal';
  ref: string;
  src: 'katago' | 'none';
}
export interface CountReply extends ScoreReply {
  t: 'count';
  ref: string;
}
export interface ErrorReply {
  t: 'error';
  ref?: string;
  message: string;
}
export type Reply = ProposalReply | CountReply | ErrorReply;

export interface Deps {
  /** null when this service runs with no KataGo configured at all; `propose` then answers with
   * `src: "none"` straight away, the same as a KataGo that errors or times out. */
  katago: KataGoClient | null;
}

const VALID_TYPES = new Set(['propose', 'count']);
const VALID_SIZES = new Set([9, 13, 19]);
const VALID_RULESETS = new Set(['j', 'c']);

function isNonNegativeInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v) && v >= 0;
}

/** A request's `ref`, read defensively: `req` comes from outside (lila, eventually over Redis,
 * unit 4.5), so it may not even be an object. Used both before and after full validation, so an
 * error reply always carries the caller's ref when there is one to carry. */
function safeRef(req: unknown): string | undefined {
  if (typeof req !== 'object' || req === null) return undefined;
  const ref = (req as { ref?: unknown }).ref;
  return typeof ref === 'string' ? ref : undefined;
}

/** Checks the shape and range of an incoming request before anything else touches it (B4, review
 * finding for unit 4.4: `handle` must never throw on bad input, whatever shape it's given).
 * Returns an error message, or null when the request is well-formed enough to go on to
 * `parseBoard`/`parsePoints` (which still do their own, more specific checks). */
function validateRequest(req: unknown): string | null {
  if (typeof req !== 'object' || req === null) return 'request must be an object';
  const r = req as Record<string, unknown>;
  if (!VALID_TYPES.has(r.t as string)) return `t must be 'propose' or 'count', got ${JSON.stringify(r.t)}`;
  if (typeof r.ref !== 'string') return `ref must be a string, got ${JSON.stringify(r.ref)}`;
  if (!VALID_SIZES.has(r.size as number)) return `size must be 9, 13 or 19, got ${JSON.stringify(r.size)}`;
  if (!VALID_RULESETS.has(r.rules as string)) {
    return `rules must be 'j' or 'c', got ${JSON.stringify(r.rules)}`;
  }
  // A multiple of 0.5 is exact in floating point (the denominator is a power of two), so no
  // epsilon is needed here.
  if (typeof r.komi !== 'number' || !Number.isFinite(r.komi) || (r.komi * 2) % 1 !== 0) {
    return `komi must be a finite multiple of 0.5, got ${JSON.stringify(r.komi)}`;
  }
  if (!isNonNegativeInt(r.handicap) || r.handicap > 9) {
    return `handicap must be an integer from 0 to 9, got ${JSON.stringify(r.handicap)}`;
  }
  const prisoners = r.prisoners as Record<string, unknown> | null | undefined;
  if (
    typeof prisoners !== 'object' ||
    prisoners === null ||
    !isNonNegativeInt(prisoners.b) ||
    !isNonNegativeInt(prisoners.w)
  ) {
    return `prisoners.b and prisoners.w must be non-negative integers, got ${JSON.stringify(r.prisoners)}`;
  }
  if (typeof r.board !== 'string') return `board must be a string, got ${JSON.stringify(r.board)}`;
  if (r.t === 'count') {
    if (!Array.isArray(r.dead) || !r.dead.every(p => typeof p === 'string')) {
      return `dead must be an array of strings, got ${JSON.stringify(r.dead)}`;
    }
  }
  return null;
}

/** Turns one lila → service message into one service → lila reply (ADR 0020 §1). Never throws:
 * every failure this function can attribute to the request becomes an `error` reply; anything
 * else propagates, since it means the service itself is broken. */
export async function handle(req: Request, deps: Deps): Promise<Reply> {
  const validationError = validateRequest(req);
  if (validationError) return { t: 'error', ref: safeRef(req), message: validationError };

  const ref = req.ref;
  let board;
  try {
    board = parseBoard(req.board, req.size);
  } catch (e) {
    return { t: 'error', ref, message: `bad board: ${(e as Error).message}` };
  }

  if (req.t === 'propose') {
    if (!deps.katago) {
      const r = noneDead(board, req.rules, req.komi, req.handicap, req.prisoners);
      return { t: 'proposal', ref: req.ref, src: 'none', ...r };
    }
    try {
      const ownership = await deps.katago.ownershipMaps(board, fullRules(req.rules), req.komi);
      const r = proposeFromOwnership(board, req.rules, ownership, req.komi, req.handicap, req.prisoners);
      return { t: 'proposal', ref: req.ref, src: 'katago', ...r };
    } catch (e) {
      if (!(e instanceof KataGoUnavailable)) throw e;
      const r = noneDead(board, req.rules, req.komi, req.handicap, req.prisoners);
      return { t: 'proposal', ref: req.ref, src: 'none', ...r };
    }
  }

  // count: the dead stones lila sends must already be whole chains (ADR 0020 §1: "go-rules
  // checks this on arrival"; this service checks it too, since it is what turns the set into a
  // count and a malformed set would silently mis-score rather than fail loudly).
  let dead;
  try {
    dead = parsePoints(req.dead);
  } catch (e) {
    return { t: 'error', ref: req.ref, message: `bad dead stones: ${(e as Error).message}` };
  }
  if (!isWholeChains(board, dead)) {
    return { t: 'error', ref: req.ref, message: 'dead stones are not whole chains' };
  }
  // A recount never asks KataGo (ADR 0020 §1), so it has no new ownership map and cannot tell
  // which points still need sealing; `seal` stays empty; the phase's `sl` (unit 4.8) keeps
  // showing what the proposal found, unaffected by later toggles.
  const { owner, score } = countGiven(board, req.rules, req.komi, req.handicap, dead, req.prisoners);
  return { t: 'count', ref: req.ref, dead: req.dead, seal: [], owner, score };
}

function fullRules(rules: Ruleset): 'chinese' | 'japanese' {
  return rules === 'j' ? 'japanese' : 'chinese';
}
