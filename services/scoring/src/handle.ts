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

/** Turns one lila → service message into one service → lila reply (ADR 0020 §1). Never throws:
 * every failure this function can attribute to the request becomes an `error` reply; anything
 * else propagates, since it means the service itself is broken. */
export async function handle(req: Request, deps: Deps): Promise<Reply> {
  const ref = (req as { ref?: string }).ref;
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
