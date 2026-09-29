import type { VNode } from 'snabbdom';

import type { ChatCtrl, ChatPlugin, ChatOpts } from 'lib/chat/interfaces';
import type { Player, Status, Source, Clock } from 'lib/game';
import type { Coords, MoveEvent } from 'lib/prefs';
import type { EnhanceOpts } from 'lib/richText';
import type { TreeNode, TreeNodeBase, TreePath } from 'lib/tree/types';

import type { ForecastData } from './forecast/interfaces';
import type { AnalyseSocketSend } from './socket';

export interface NvuiPlugin {
  render(): VNode;
}

export interface AnalyseApi {
  socketReceive(type: string, data: any): boolean;
  path(): TreePath;
  setChapter(id: string): void;
}

export interface OpeningPuzzle {
  key: string;
  name: string;
  count: number;
}

// similar, but not identical, to game/GameData
export interface AnalyseData {
  game: Game;
  player: Player;
  opponent: Player;
  orientation: Color;
  spectator?: boolean; // for compat with GameData, for game functions
  takebackable: boolean;
  moretimeable: boolean;
  analysis?: Analysis;
  userAnalysis: boolean;
  forecast?: ForecastData;
  sidelines?: TreeNode[][];
  treeParts: TreeNodeBase[];
  clock?: Clock;
  pref: AnalysePref;
  userTv?: {
    id: string;
  };
  puzzle?: OpeningPuzzle;
}

export interface AnalysePref {
  coords: Coords;
  is3d?: boolean;
  showDests?: boolean;
  rookCastle?: boolean;
  destination?: boolean;
  highlight?: boolean;
  showCaptured?: boolean;
  animationDuration?: number;
  keyboardMove: boolean;
  moveEvent: MoveEvent;
}

// similar, but not identical, to game/Game
export interface Game {
  id: string;
  status: Status;
  player: Color;
  turns: number;
  fen: FEN;
  startedAtTurn?: number;
  source: Source;
  speed: Speed;
  variant: Variant;
  winner?: Color;
  moveCentis?: number[];
  initialFen?: string;
  importedBy?: string;
  division?: Division;
  opening?: Opening;
  perf: Perf;
  rated?: boolean;
  threefold?: boolean;
}

export interface Opening {
  name: string;
  eco: string;
  ply: Ply;
}

export interface Division {
  middle?: number;
  end?: number;
}

export interface Analysis {
  id: string;
  nodesPerMove: number;
  white: AnalysisSide;
  black: AnalysisSide;
  partial?: boolean;
}

export type GamePhase = 'opening' | 'middlegame' | 'endgame';

export interface AnalysisSide {
  acpl: number;
  inaccuracy: number;
  mistake: number;
  blunder: number;
  accuracy: number;
  phases?: Partial<Record<GamePhase, number>>;
}

export interface AnalyseOpts {
  element: HTMLElement;
  data: AnalyseData;
  userId?: string;
  hunter: boolean;
  socketSend: AnalyseSocketSend;
  $side?: Cash;
  $underboard?: Cash;
  chat: ChatOpts & {
    plugin: ChatPlugin;
    enhance: EnhanceOpts;
    instance?: ChatCtrl;
  };
  wiki?: boolean;
  inlinePgn?: string;
  embed?: boolean;
  socketUrl?: string;
  socketVersion?: number;
}

export interface JustCaptured extends Piece {
  promoted?: boolean;
}

export type Conceal = false | 'conceal' | 'hide' | null;
export type ConcealOf = (isMainline: boolean) => (path: TreePath, node: TreeNode) => Conceal;
