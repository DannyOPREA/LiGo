import { stepsOf } from './go';
import type { RoundData, Step } from './interfaces';

export const firstPly = (d: RoundData): number => d.steps[0].ply;

export const lastPly = (d: RoundData): number => lastStep(d).ply;

export const lastStep = (d: RoundData): Step => d.steps[d.steps.length - 1];

export const plyStep = (d: RoundData, ply: number): Step => d.steps[ply - firstPly(d)];

/** The moves played up to `ply` (SGF points and passes). */
export const movesUntil = (d: RoundData, ply: number): string[] =>
  d.steps.slice(1, ply - firstPly(d) + 1).map(s => s.uci);

export const upgradeServerData = (d: RoundData): void => {
  if (d.correspondence) d.correspondence.showBar = d.pref.clockBar;

  // A Go game's move list comes from its moves, from the ply its first move is played at (ADR 0019
  // §3): the server's `steps` describe the unused chess game it still carries until unit 3.17.
  d.steps = stepsOf(d.game.go, d.game.startedAtTurn ?? 0);

  if (d.expiration) d.expiration.movedAt = Date.now() - d.expiration.idleMillis;
};
