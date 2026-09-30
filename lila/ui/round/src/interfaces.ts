import type { ChatOpts as BaseChatOpts, ChatCtrl, ChatPlugin } from 'lib/chat/interfaces';
import type { GameData, Status } from 'lib/game';
import type { ClockData } from 'lib/game/clock/clockCtrl';
import * as Prefs from 'lib/prefs';
import type { EnhanceOpts } from 'lib/richText';

import type { CorresClockData } from './corresClock/corresClockCtrl';

export { type RoundSocket } from './socket';
export { type CorresClockData } from './corresClock/corresClockCtrl';
export type { default as RoundController } from './ctrl';
export type { ClockData } from 'lib/game/clock/clockCtrl';

/** A move sent to the server (ADR 0019 §6): an SGF point such as `"dd"`, or `"pass"`. */
export interface SocketMove {
  u: string;
  b?: 1;
}

/** One entry of the move list: the position after `ply` plies, reached by `uci`. */
export interface Step {
  ply: Ply;
  /** The move as sent on the wire: an SGF point or `"pass"`; empty for the starting position. */
  uci: string;
  /** The move as printed on the board ("D4", "Pass"); empty for the starting position. */
  san: string;
}

/** A Go game's setup and moves (lila/modules/game `JsonView.go`, units 3.12–3.13). */
export interface GoData {
  size: 9 | 13 | 19;
  rules: 'japanese' | 'chinese';
  komi: number;
  /** SGF points, `pass` and (from Phase 4) `resume`, separated by spaces. */
  moves: string;
  /** `b` counts the White stones Black has taken. */
  prisoners: { b: number; w: number };
  phase: 'play' | 'scoring';
  handicap?: number;
  /** A custom starting position (later: analysis, puzzles). */
  position?: { black: string[]; white: string[]; toMove: Color };
  ko?: string;
}

/** The server's `move` event for a Go game (ADR 0019 §6, lila/modules/game `Event.GoMove`). */
export interface GoMoveEvent {
  /** The stone's SGF point; absent for a pass. */
  p?: string;
  pass?: true;
  ply: number;
  /** The points this move captured. */
  cap: string[];
  prisoners: { b: number; w: number };
  ko?: string;
  phase: 'play' | 'scoring';
  /** The position for live mini boards (rows of `b`, `w` and runs of empty points). */
  board: string;
  clock?: {
    white: Seconds;
    black: Seconds;
    lag?: Centis;
  };
  status?: Status;
  winner?: Color;
  volume?: number;
}

export interface EventsWithPayload {
  flag: Color;
  move: SocketMove;
}

export type EventsWithoutPayload =
  | 'moretime'
  | 'berserk'
  | 'rematch-yes'
  | 'rematch-no'
  | 'takeback-yes'
  | 'takeback-no'
  | 'bye2'
  | 'resign-force'
  | 'resign'
  | 'abort';

export interface RoundSocketSend {
  <K extends keyof EventsWithPayload>(
    type: K,
    data: EventsWithPayload[K],
    opts?: { ackable?: boolean },
    noRetry?: boolean,
  ): void;
  <K extends EventsWithoutPayload>(
    type: K,
    data?: undefined,
    opts?: { ackable?: boolean },
    noRetry?: boolean,
  ): void;
}

export interface RoundData extends GameData {
  game: GameData['game'] & { go: GoData };
  clock?: ClockData;
  pref: Pref;
  /** Built from `game.go` on arrival (`util.upgradeServerData`); the server's chess steps are ignored. */
  steps: Step[];
  forecastCount?: number;
  opponentSignal?: number;
  correspondence?: CorresClockData;
  tv?: Tv;
  userTv?: {
    id: UserId;
  };
  expiration?: Expiration;
}

export interface Expiration {
  idleMillis: number;
  movedAt: number;
  millisToMove: number;
}

export interface Tv {
  channel: string;
  flip: boolean;
}

export interface RoundOpts {
  data: RoundData;
  userId?: string;
  socketSend?: RoundSocketSend;
  onChange(d: RoundData): void;
  element?: HTMLElement;
  crosstableEl?: HTMLElement;
  chat?: ChatOpts;
}

export interface ChatOpts extends BaseChatOpts {
  preset?: 'start' | 'end';
  enhance?: EnhanceOpts;
  plugin?: ChatPlugin;
  alwaysEnabled: boolean;
  noteId?: string;
  noteAge?: number;
  noteText?: string;
  instance?: ChatCtrl;
}

export interface ApiEnd {
  winner?: Color;
  status: Status;
  abortedBy?: Color;
  ratingDiff?: {
    white: number;
    black: number;
  };
  boosted: boolean;
  clock?: {
    wc: Centis;
    bc: Centis;
  };
}

export interface Pref {
  animationDuration: number;
  clockBar: boolean;
  clockSound: boolean;
  clockTenths: Prefs.ShowClockTenths;
  confirmResign: boolean;
  /** `Pref.ConfirmMoves` (unit 2.3): 0 never, 1 on touch screens, 2 always. */
  confirmMoves?: number;
  coords: Prefs.Coords;
  ratings: boolean;
  replay: Prefs.Replay;
  resizeHandle: Prefs.ShowResizeHandle;
}

export interface RoundTour {
  corresRematchOffline: () => void;
}
