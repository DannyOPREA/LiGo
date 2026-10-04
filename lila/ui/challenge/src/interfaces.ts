import type { LiconValue } from 'lib/licon';

export interface ChallengeOpts {
  el: Element;
  data?: ChallengeData;
  show(): void;
  setCount(nb: number): void;
  pulse(): void;
}

type ChallengeStatus = 'created' | 'offline' | 'canceled' | 'declined' | 'accepted';
export type ChallengeDirection = 'in' | 'out';

export interface ChallengeUser extends LightUser {
  rating: number;
  provisional?: boolean;
  goRank?: string; // LiGo: the kyu/dan label (ADR 0021 §3)
  online?: boolean;
  lag?: number;
}

export interface TimeControl {
  type: 'clock' | 'byoyomi' | 'correspondence' | 'unlimited';
  show?: string;
  daysPerTurn?: number;
  limit: number;
  increment: number;
}

export interface Challenge {
  id: string;
  direction: ChallengeDirection;
  status: ChallengeStatus;
  challenger?: ChallengeUser;
  destUser?: ChallengeUser;
  rules?: unknown[];
  go?: { size: number; rules: string }; // board size and ruleset (unit 3.12)
  initialFen: FEN;
  rated: boolean;
  timeControl: TimeControl;
  color: Color | 'random';
  finalColor: Color;
  perf: {
    icon: LiconValue;
    name: string;
  };
  declined?: boolean;
}

export type Reasons = Record<string, string>;

export interface ChallengeData {
  in: Array<Challenge>;
  out: Array<Challenge>;
  reasons?: Reasons;
}
