import type { ColorChoice } from 'lib/setup/color';
import type { ClockConfig } from 'lib/setup/interfaces';
import type { TimeMode } from 'lib/setup/timeControl';

import type { GoRuleset, GoSetupJson, GoSize } from './goSetup';

export type Sort = 'rating' | 'time';
export type Mode = 'list' | 'chart';
export type Tab = 'pools' | 'real_time' | 'seeks' | 'now_playing';
export type GameType = 'hook' | 'friend';
export type GameMode = 'casual' | 'rated';

export interface Hook {
  id: string;
  sri: string;
  clock: string;
  t: number; // time
  s: number; // speed
  i: number; // increment
  variant: VariantKey;
  perf: Exclude<Perf, 'fromPosition'>;
  prov?: true; // is rating provisional
  u?: string; // username
  rating?: number;
  ra?: 1; // rated
  go?: GoSetupJson; // board size, ruleset and komi (unit 3.15)
  action: 'cancel' | 'join';
  disabled?: boolean;
}

export interface Seek {
  id: string;
  username: string;
  rating: number;
  mode: number;
  days?: number;
  perf: {
    key: Exclude<Perf, 'fromPosition'>;
  };
  provisional?: boolean;
  variant?: { key: VariantKey };
  go?: GoSetupJson; // board size, ruleset and komi (unit 3.15)
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
  counters: { members: number; rounds: number };
}

type RatingWithProvisional = number;

export interface NowPlaying {
  fullId: string;
  gameId: string;
  fen: FEN;
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
}

export interface ForceSetupOptions {
  goSize?: GoSize;
  goRuleset?: GoRuleset;
  goKomi?: number;
  timeMode?: TimeMode;
  time?: number;
  increment?: number;
  days?: number;
  mode?: GameMode;
  color?: ColorChoice;
}
