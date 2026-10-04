// Types of sgf.mjs for lila's TypeScript (the analysis board, unit 7.4), kept by hand like
// rules.d.mts. Change both files together.
// Licence: MIT (LiGo's own code, ADR 0006).

/** The most text the analysis board and the server's import read (ADR 0023 §2). */
export declare const MAX_SGF_LENGTH: number;

/** The most nodes (moves and notes) a record may have. */
export declare const MAX_SGF_NODES: number;

/** The deepest nesting of variations either reader accepts. */
export declare const MAX_SGF_DEPTH: number;

/** Why a record can't be read; `move` is the move number when a move is the cause. */
export declare class SgfError extends Error {
  readonly move: number | undefined;
  constructor(message: string, move?: number);
}

/** A game's settings, from its SGF root (libs/conformance/sgf/root.json). */
export interface SgfSettings {
  size: 9 | 13 | 19;
  ruleset: 'japanese' | 'chinese';
  komi: number;
  handicap: number;
  /** Setup stones, as SGF points. */
  black: string[];
  white: string[];
  toMove: 'black' | 'white';
  /** `RU` named a ruleset LiGo doesn't know, so Japanese was assumed. */
  rulesetUnknown?: true;
}

/** A lila-shaped comment and glyph (lila's `Tree.Comment` and `Tree.Glyph`). */
export interface SgfComment {
  id: string;
  by: string;
  text: string;
}
export interface SgfGlyph {
  id: number;
  symbol: string;
  name: string;
}

/** A node of the analysis tree (ADR 0023 §1): lila's generic fields and the Go ones. */
export interface GoNode {
  /** The move, two characters as lila's tree paths need: an SGF point, or ".." for a pass; "" at the root. */
  id: string;
  ply: number;
  /** An SGF point, "..", or null at the root. */
  move: string | null;
  color: 'black' | 'white' | null;
  /** The position after the move. */
  stones: { black: string[]; white: string[] };
  captures: { black: number; white: number };
  /** The point the ko rule forbids next, if any. */
  ko: string | null;
  toMove: 'black' | 'white';
  children: GoNode[];
  comments: SgfComment[];
  glyphs: SgfGlyph[];
  /** SGF properties kept as they were (marks, game info), written back. */
  sgf: Record<string, string[]>;
  /** Shown as a variation although it is the first child (lila's tree; not written to SGF). */
  forceVariation?: boolean;
}

export interface GoRoot extends GoNode {
  settings: SgfSettings;
}

export declare function rootSettings(
  props: Record<string, string[]>,
  firstMove?: 'black' | 'white',
): SgfSettings;

/** Reads an SGF record (the first game of a collection); throws an `SgfError`. */
export declare function readTree(text: string, options?: { maxLength?: number }): GoRoot;

/** The node a move makes from the end of `line` (the root, then each node down), or why it's refused. */
export declare function playFrom(
  line: [GoRoot, ...GoNode[]],
  move: string,
): { node: GoNode } | { refused: 'occupied' | 'suicide' | 'superko' };

/** The whole tree as an SGF record. */
export declare function writeTree(root: GoRoot): string;

/** An SGF file's text: UTF-8 unless its `CA` names another charset. */
export declare function decodeSgf(bytes: Uint8Array): string;
