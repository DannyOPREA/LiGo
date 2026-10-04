// The chess puzzle page's move-tree nodes, with their positions worked out by chessops. They were
// lila's `lib/tree/node.ts` until the Go analysis board (unit 7.4) made lila's tree game-neutral;
// this page is the last one that plays chess and goes with it (unit 8.7).

import type { Result } from '@badrap/result';
import { type Outcome, type Position, parseUci, makeSquare } from 'chessops';
import { chessgroundDests, lichessRules, scalachessCharPair } from 'chessops/compat';
import { parseFen } from 'chessops/fen';
import { setupPosition } from 'chessops/variant';

import { memoize } from 'lib';
import type { TreeNodeBase, TreeNodeLite } from 'lib/tree/types';

export type PositionResult = Result<Position>;

/** A tree node with its chess position and what can be played from it. */
export interface ChessNode extends TreeNodeLite {
  children: ChessNode[];
  pos: () => PositionResult;
  dests: () => Dests;
  drops: () => Key[] | undefined;
  check: () => boolean;
  outcome: () => Outcome | undefined;
}

type ChessNodeInput = TreeNodeBase & Partial<Pick<ChessNode, 'pos' | 'outcome'>>;

// mutates and returns the node
export const completeNode =
  (variant: VariantKey) =>
  (from: ChessNodeInput): ChessNode => {
    const node = from as ChessNode;
    node.id ||= node.uci ? scalachessCharPair(parseUci(node.uci)!) : '';
    node.children ||= [];
    node.pos ||= memoize(() =>
      parseFen(node.fen).chain(setup => setupPosition(lichessRules(variant), setup)),
    );
    node.dests = memoize(() => computeDests(node.pos(), variant === 'chess960'));
    node.drops = memoize(() => computeDrops(variant, node.pos()));
    node.check = memoize(() => computeCheck(node.pos()));
    node.outcome ||= memoize(() => computeOutcome(node.pos()));
    node.children.forEach(completeNode(variant));
    return node;
  };

const computeDests = (position: PositionResult, chess960: boolean) =>
  withPosition<Dests>(position, new Map(), p => chessgroundDests(p, { chess960 }));

const computeDrops = (variant: VariantKey, position: PositionResult): Key[] | undefined =>
  variant === 'crazyhouse'
    ? withPosition(position, undefined, p => Array.from(p.dropDests(), makeSquare))
    : [];

const computeCheck = (position: PositionResult) => withPosition(position, false, p => p.isCheck());

const computeOutcome = (position: PositionResult) => withPosition(position, undefined, p => p.outcome());

const withPosition = <A>(position: PositionResult, defaultValue: A, f: (p: Position) => A): A =>
  position.unwrap(f, err => {
    console.error(err);
    return defaultValue;
  });
