// lila's move tree, for any game (unit 7.4): generic over its node type (`TreeNodeOf`). The Go
// pages' node is libs/board's `GoNode` (ADR 0023 §1); the chess fields below stay only until the
// chess leftovers go (unit 3.19 part 2).

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

/** What the tree's operations (`ops.ts`, `tree.ts`) use of a node, whatever the game. */
export interface TreeNodeShape {
  id?: TreeNodeId;
  children?: TreeNodeShape[];
  ply: Ply;
  comments?: TreeComment[];
  eval?: ServerEval;
  glyphs?: Glyph[];
  clock?: Clock;
  forceVariation?: boolean;
  shapes?: Shape[];
  comp?: boolean;
  collapsed?: boolean;
}

/** A node as lila's server sends it for a chess game. */
export interface TreeNodeBase extends TreeNodeShape {
  // file://./../../tree/src/tree.ts
  children?: TreeNodeBase[];
  uci?: Uci;
  fen: FEN;
  gamebook?: Gamebook;
  parentClock?: Clock;
  san?: string;
  threefold?: boolean;
  fail?: boolean;
  puzzle?: 'win' | 'fail' | 'good' | 'retry';
  crazy?: NodeCrazy;
}

export interface TreeNodeLite extends TreeNodeBase {
  id: TreeNodeId;
  children: TreeNodeLite[];
}

/** A node the tree holds: an id and children at every level. */
export interface TreeNode extends TreeNodeLite {
  children: TreeNode[];
}

/** A node `makeTree` can hold, whose children are nodes of its own kind: chess (`TreeNode`) or Go
 * (libs/board's `GoNode`). */
export interface TreeNodeOf<N extends TreeNodeShape> extends TreeNodeShape {
  id: TreeNodeId;
  children: N[];
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
