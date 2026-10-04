import type { ColorChoice } from 'lib/setup/color';
import type { ClockConfig } from 'lib/setup/interfaces';
import type { TimeMode } from 'lib/setup/timeControl';

import type { GoRuleset, GoSetupJson, GoSize } from './goSetup';

// Open challenges come in two kinds: real-time hooks ('live') and correspondence seeks.
export type Mode = 'live' | 'correspondence';
export type Tab = 'pools' | 'open' | 'now_playing';
export type GameType = 'hook' | 'friend';
export type GameMode = 'casual' | 'rated';

export interface Hook {
  id: string;
  sri: string;
  clock: string;
  t: number; // time
  s: number; // speed
  i: number; // increment (0 for byo-yomi)
  byo?: { limit: number; periods: number; period: number }; // byo-yomi hooks (unit 4.9)
  variant: VariantKey;
  perf: Exclude<Perf, 'fromPosition'>;
  prov?: true; // is rating provisional
  u?: string; // username
  rating?: number;
  goRank?: string; // LiGo: the kyu/dan label for `rating` (ADR 0021 §3)
  ra?: 1; // rated
  go?: GoSetupJson; // board size, ruleset and komi (unit 3.15)
  auth?: boolean; // made by a signed-in player (unit 6.5)
  rr?: RatingRangeJson; // the rating range its creator asked for (unit 6.5)
  action: 'cancel' | 'join';
  disabled?: boolean;
}

// An open game's rating range, with the ranks of its bounds; a bound at lila's limit has none (unit 6.5)
export interface RatingRangeJson {
  min: number;
  max: number;
  low?: string;
  high?: string;
}

export interface Seek {
  id: string;
  username: string;
  rating: number;
  goRank?: string; // LiGo: the kyu/dan label for `rating` (ADR 0021 §3)
  mode: number;
  days?: number;
  perf: {
    key: Exclude<Perf, 'fromPosition'>;
  };
  provisional?: boolean;
  variant?: { key: VariantKey };
  go?: GoSetupJson; // board size, ruleset and komi (unit 3.15)
  rr?: RatingRangeJson; // the rating range its creator asked for (unit 6.5)
  action: 'joinSeek' | 'cancelSeek';
}

export interface Pool extends ClockConfig {
  id: PoolId;
}

export interface LobbyOpts {
  appElement: HTMLElement;
  tableElement: HTMLElement;
  socketSend: SocketSend;
  pools: Pool[];
  playban: boolean;
  showRatings: boolean;
  data: LobbyData;
}

export interface LobbyMe {
  isBot: boolean;
  username: string;
}

export interface LobbyData {
  hooks: Hook[];
  seeks: Seek[];
  me?: LobbyMe;
  nbNowPlaying: number;
  nbMyTurn: number;
  nowPlaying: NowPlaying[];
  ratingMap: Record<string, RatingWithProvisional> | null; // by perf key; Go's is `go`
  goRank?: string; // LiGo: the viewer's kyu/dan label (ADR 0021 §3, unit 5.5)
  counters: { members: number; rounds: number };
}

type RatingWithProvisional = number;

export interface NowPlaying {
  fullId: string;
  gameId: string;
  /** A chess game's position (none for Go). */
  fen?: FEN;
  /** A Go game's position, as a compact board string (ADR 0019 §6). */
  board?: string;
  color: Color;
  orientation?: Color;
  lastMove: string;
  variant: {
    key: string;
    name: string;
  };
  speed: string;
  perf: string;
  rated: boolean;
  hasMoved: boolean;
  opponent: {
    id: string;
    username: string;
    rating?: number;
    ai?: number;
  };
  isMyTurn: boolean;
  secondsLeft?: number;
}

export interface PoolMember {
  id: PoolId;
  range?: PoolRange;
  blocking?: string;
}

export type PoolId = string;
export type PoolRange = string;

export interface SetupStore {
  goSize: GoSize;
  goRuleset: GoRuleset;
  goKomi: number;
  timeMode: TimeMode;
  gameMode: GameMode;
  color: ColorChoice;
  ratingMin: number;
  ratingMax: number;
  time: number;
  increment: number;
  days: number;
  periods: number; // byo-yomi (unit 4.9)
  periodTime: number; // seconds
  handicap: number; // friend window only
}

export interface ForceSetupOptions {
  goSize?: GoSize;
  goRuleset?: GoRuleset;
  goKomi?: number;
  timeMode?: TimeMode;
  time?: number;
  increment?: number;
  days?: number;
  periods?: number;
  periodTime?: number;
  handicap?: number;
  mode?: GameMode;
  color?: ColorChoice;
}
