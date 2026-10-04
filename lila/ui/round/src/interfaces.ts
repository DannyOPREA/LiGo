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
  clock?: ClockEvent;
  status?: Status;
  winner?: Color;
  volume?: number;
}

/** Each side's byo-yomi periods left, counting the one in progress, and their length (ADR 0020 §7). */
export interface ByoyomiData {
  periods: { b: number; w: number };
  /** The period length in seconds. */
  byo: number;
  /** Whether each side's main time is over (asked of Phase 4 for unit 4.8; optional until then). */
  inByo?: { b: boolean; w: boolean };
}

/** The clocks after a move or a resume; a byo-yomi clock adds its periods (unit 4.7). */
export interface ClockEvent extends Partial<ByoyomiData> {
  /** Main time, or once in byo-yomi the time left in the current period. */
  white: Seconds;
  black: Seconds;
  lag?: Centis;
}

/** One side's count, as the scoring service made it (ADR 0020 §1). */
export interface ScoreSide {
  territory: number;
  stones: number;
  prisoners: number;
  /** Komi and handicap compensation included. */
  total: number;
  komi?: number;
  compensation?: number;
}

/**
 * The scoring phase as the server shows it (ADR 0020 §6, lila/modules/game `JsonView.goScoring`):
 * `counting` while the proposal is awaited, then the marks, the count and who accepted it.
 */
export interface ScoringData {
  /** 1, then one more after each resume. */
  phase: number;
  /** Seconds before the phase times out (or, while counting, before lila stops waiting). */
  expiresIn: number;
  counting?: true;
  /** The count version that toggles and accepts name: `<phase>:<count>`. */
  v?: string;
  /** Where the proposal came from: KataGo, or nothing marked dead (the service couldn't ask KataGo). */
  src?: 'katago' | 'none';
  dead?: string[];
  /** Points that may still need a move. */
  seal?: string[];
  /** One of `b`, `w`, `.` per point, row by row. */
  owner?: string;
  score?: { b: ScoreSide; w: ScoreSide };
  accepted?: { b: boolean; w: boolean };
  /** A recount is on its way: no toggle or accept until it arrives. */
  pending?: boolean;
}

/** The server's `resume` event: a player took the game back to play (ADR 0020 §6). */
export interface ResumeEvent {
  ply: number;
  turn: Color;
  phase: 'play';
  board: string;
  clock?: ClockEvent;
}

export interface EventsWithPayload {
  flag: Color;
  move: SocketMove;
  /** Mark a chain dead or alive again: any stone of it, and the count version on show. */
  'score-toggle': { p: string; v: string };
  /** Accept the count on show. */
  'score-accept': { v: string };
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
  | 'abort'
  | 'score-resume';

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
  game: GameData['game'] & {
    go: GoData;
    /** The scoring phase under way, or the count that ended the game. */
    scoring?: ScoringData;
    /** A game ended by counting: `B+3.5`, `W+0.5`, or `0` for jigo (ADR 0020 §5). */
    result?: string;
  };
  clock?: ClockData & Partial<ByoyomiData> & { emerg?: Seconds };
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
  /** A game ended by counting: `B+3.5`, `W+0.5`, or `0`. */
  result?: string;
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
