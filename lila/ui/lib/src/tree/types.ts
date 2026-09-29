import type { Result } from '@badrap/result';
import type { Outcome, Position } from 'chessops';

export type TreeNodeId = string;
export type TreePath = string;

export interface ServerEval extends EvalScore {
  best?: Uci | '(none)';
  fen: FEN;
  knodes: number;
  depth: number;
  pvs: PvDataServer[];
}

export interface PvDataServer extends EvalScore {
  moves: string;
}

export interface TreeNodeBase {
  // file://./../../tree/src/tree.ts
  id?: TreeNodeId;
  children?: TreeNodeBase[];
  ply: Ply;
  uci?: Uci;
  fen: FEN;
  comments?: TreeComment[];
  gamebook?: Gamebook;
  eval?: ServerEval;
  glyphs?: Glyph[];
  clock?: Clock;
  parentClock?: Clock;
  forceVariation?: boolean;
  shapes?: Shape[];
  comp?: boolean;
  san?: string;
  threefold?: boolean;
  fail?: boolean;
  puzzle?: 'win' | 'fail' | 'good' | 'retry';
  crazy?: NodeCrazy;
  collapsed?: boolean;
  pos?: () => PositionResult; // precomputed
  dests?: () => Dests;
  drops?: () => Key[] | undefined;
  check?: () => boolean;
  outcome?: () => Outcome | undefined;
}

type TreeNodeFunctionProps<T> = {
  [K in keyof T]-?: NonNullable<T[K]> extends (...args: any) => any ? K : never;
}[keyof T];

export interface TreeNodeLite extends Omit<TreeNodeBase, TreeNodeFunctionProps<TreeNodeBase>> {
  id: TreeNodeId;
  children: TreeNodeLite[];
}

export type PositionResult = Result<Position>;

export interface TreeNode extends TreeNodeLite {
  children: TreeNode[];
  pos: () => PositionResult;
  dests: () => Dests;
  drops: () => Key[] | undefined;
  check: () => boolean;
  outcome: () => Outcome | undefined;
}

export interface NodeCrazy {
  pockets: [CrazyPocket, CrazyPocket];
}

export type CrazyPocket = Record<Exclude<Role, 'king'>, number>;

export interface TreeComment {
  id: string;
  by:
    | string
    | {
        id: string;
        name: string;
      };
  text: string;
}

export interface Gamebook {
  deviation?: string;
  hint?: string;
  shapes?: Shape[];
}

export type GlyphId = number;

export interface Glyph {
  id: GlyphId;
  name: string;
  symbol: string;
}

export type Clock = number;

export interface Shape {
  orig: Key;
  dest?: Key;
}
