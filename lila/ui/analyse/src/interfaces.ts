import type { GoNode, GoRoot } from '@ligo/board/sgf';

/** What `/analysis` gives the page (lila `views.analyse.ui.userAnalysis`, unit 7.4). */
export interface AnalyseOpts {
  element: HTMLElement;
  /** An SGF record to open (a finished game's, from unit 7.5); a new 19×19 board without one. */
  sgf?: string;
  /** Letters and numbers round the board (lila's `coords` preference; 0 is none). */
  coords?: number;
  /** Set when the record is a stored game's (unit 7.5): where its page and its SGF download are. */
  game?: { url: string; sgfUrl: string };
}

export interface AnalyseApi {
  path(): string;
}

/** The analysis tree's nodes: libs/board's Go nodes (ADR 0023 §1). */
export type AnalyseNode = GoNode;
export type AnalyseRoot = GoRoot;

/** The root, then each node down to the one shown. */
export type Line = [GoRoot, ...GoNode[]];
