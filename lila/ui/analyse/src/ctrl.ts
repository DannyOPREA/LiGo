// The analysis board's controller (unit 7.4, ADR 0023 §1): lila's `ui/analyse` on a Go board.
// lila's move tree (`lib/tree`) holds libs/board's Go nodes; every move is replayed from the root
// by libs/board's `playFrom` with LiGo's settings, never taken from the board or a file. The board
// only shows the position and reports the point the player picked. Nothing is stored: a position
// or file loaded here is gone on reload (as lila's `/analysis`); the SGF download keeps it.

import { readTree, playFrom, writeTree, decodeSgf, SgfError, MAX_SGF_LENGTH } from '@ligo/board/sgf';

import { propWithEffect, toggle, type Prop, type Toggle } from 'lib';
import { makeTree, treePath, treeOps, type TreeWrapper } from 'lib/tree';
import type { TreePath } from 'lib/tree/types';
import { confirm } from 'lib/view';

import { Autoplay, type AutoplayDelay } from './autoplay';
import {
  boardMove,
  boardSetup,
  capturedBy,
  positionSgf,
  soundOf,
  treeMove,
  type NewPosition,
  type Ruleset,
  type Size,
} from './go';
import type { AnalyseNode, AnalyseOpts, AnalyseRoot, Line } from './interfaces';
import * as keyboard from './keyboard';
import Navigate from './navigate';
import { TreeView } from './treeView/treeView';
import { AnalyseBoard, type Shown } from './view/board';

/** A new 19×19 board, Japanese rules, standard komi, Black to play. */
export const EMPTY_SGF = '(;GM[1]FF[4]SZ[19]RU[Japanese]KM[6.5])';

/** The setup mode's state: the position being built, and what a tap places. */
export interface Setup extends NewPosition {
  color: 'black' | 'white';
  error?: string;
}

/** Why the rules refused a move, for the line under the board. */
const refusalText: Record<'occupied' | 'suicide' | 'superko', string> = {
  occupied: 'There is a stone there already.',
  suicide: 'That move would take the last liberty of its own stones (suicide).',
  superko: 'That move would repeat an earlier position (ko).',
};

export default class AnalyseCtrl {
  tree: TreeWrapper<AnalyseNode>;
  root: AnalyseRoot;
  board: AnalyseBoard;
  treeView: TreeView;
  navigate: Navigate;
  autoplay: Autoplay;
  actionMenu: Toggle = toggle(false);

  // the tree's cursor and the lists derived from it
  path: TreePath = treePath.root;
  node: AnalyseNode;
  nodeList: Line;
  mainline: AnalyseNode[];
  onMainline = true;

  /** Something to say under the board: why a move was refused. */
  notice?: string;
  /** The SGF box's text while the player edits it; the tree's own SGF otherwise. */
  sgfInput?: string;
  sgfError?: string;
  /** Set while the page builds a new position. */
  setup?: Setup;

  showComments = true;
  contextMenuPath?: TreePath;
  pendingDeletionPath: Prop<TreePath | null>;
  private sgfCache?: { root: AnalyseRoot; version: number; text: string };
  /** Bumped on every change to the tree, so the SGF box knows when to write it again. */
  private version = 0;

  constructor(
    readonly opts: AnalyseOpts,
    readonly redraw: () => void,
  ) {
    this.pendingDeletionPath = propWithEffect(null, this.redraw);
    this.treeView = new TreeView(this);
    this.navigate = new Navigate(this);
    this.autoplay = new Autoplay(this);
    this.board = new AnalyseBoard(this.shown, this.redraw);
    this.load(this.readOrEmpty(opts.sgf));
    keyboard.bind(this);
  }

  /** The record given, or a new board when there is none or it can't be read. */
  private readOrEmpty(sgf?: string): AnalyseRoot {
    if (sgf)
      try {
        return readTree(sgf);
      } catch (e) {
        this.sgfError = errorText(e);
      }
    return readTree(EMPTY_SGF);
  }

  /** Starts over on another tree, at its root. */
  load(root: AnalyseRoot): void {
    this.autoplay?.stop();
    this.root = root;
    this.tree = makeTree<AnalyseNode>(root);
    this.version++;
    this.setup = undefined;
    this.sgfInput = undefined;
    this.setPath(treePath.root);
    this.board.remount();
  }

  get size(): Size {
    return this.root.settings.size;
  }

  private setPath(path: TreePath): void {
    this.path = path;
    this.nodeList = this.tree.getNodeList(path) as Line;
    this.node = treeOps.last(this.nodeList)!;
    this.mainline = treeOps.mainlineNodeList(this.tree.root);
    this.onMainline = this.tree.pathIsMainline(path);
    this.notice = undefined;
  }

  /** What the board element shows: the editor in setup mode, else the position at the cursor. */
  private readonly shown = (): Shown =>
    this.setup
      ? {
          editor: {
            size: this.setup.size,
            stones: { black: this.setup.black, white: this.setup.white },
            color: this.setup.color,
            coordinates: this.coordinates(),
            onChange: stones => {
              if (!this.setup) return;
              this.setup.black = stones.black;
              this.setup.white = stones.white;
              this.setup.error = undefined;
              this.redraw();
            },
          },
        }
      : {
          board: {
            ...boardSetup(this.nodeList),
            movable: this.node.toMove,
            coordinates: this.coordinates(),
            onMove: move => this.playMove(treeMove(move)),
            onRefused: reason => this.refused(reason),
          },
        };

  private coordinates = (): boolean => this.opts.coords !== 0;

  /**
   * A move from the board (a stone or `..` for a pass): the child already there, or a new node if
   * the rules allow it here. Either way the board is drawn again from the tree.
   */
  playMove = (move: string): void => {
    if (this.setup) return;
    const path = this.path + move;
    if (this.tree.pathExists(path)) return this.userJump(path);
    const played = playFrom(this.nodeList, boardMove(move));
    if ('refused' in played) return this.refused(played.refused);
    const newPath = this.tree.addNode(played.node, this.path);
    if (!newPath) return this.redraw();
    this.version++;
    this.userJump(newPath);
  };

  pass = (): void => this.playMove('..');

  private refused(reason: 'occupied' | 'suicide' | 'superko'): void {
    site.sound.play('error');
    this.board.remount();
    this.notice = refusalText[reason];
    this.redraw();
  }

  jump(path: TreePath): void {
    const oneForward = path.length === this.path.length + 2 && path.startsWith(this.path);
    if (path !== this.path)
      this.treeView.requestAutoScroll(treeOps.distance(this.path, path) > 8 ? 'instant' : 'smooth');
    const parent = this.node;
    this.setPath(path);
    if (oneForward && this.node.move) site.sound.play(soundOf(this.node.move, capturedBy(parent, this.node)));
    this.board.remount();
  }

  userJump = (path: TreePath): void => {
    this.autoplay.stop();
    this.jump(path);
    this.redraw();
  };

  userJumpIfCan(path: TreePath): void {
    if (path !== this.path) this.userJump(path);
  }

  jumpToMain = (ply: number): void => this.userJump(treeOps.takePathWhile(this.mainline, n => n.ply <= ply));

  async deleteNode(path: TreePath): Promise<void> {
    this.pendingDeletionPath(null);
    const node = this.tree.nodeAtPath(path);
    if (!node) return;
    const count = treeOps.countChildrenAndComments(node);
    if (
      (count.nodes >= 10 || count.comments > 0) &&
      !(await confirm(
        `Delete ${plural('move', count.nodes)}${count.comments ? ` and ${plural('comment', count.comments)}` : ''}?`,
      ))
    )
      return;
    this.tree.deleteNodeAt(path);
    this.version++;
    if (treePath.contains(this.path, path)) this.userJump(treePath.init(path));
    else this.jump(this.path);
    this.redraw();
  }

  promote(path: TreePath, toMainline: boolean): void {
    this.tree.promoteAt(path, toMainline);
    this.version++;
    this.jump(path);
    this.redraw();
  }

  forceVariation(path: TreePath, force: boolean): void {
    this.tree.forceVariationAt(path, force);
    this.jump(path);
    this.redraw();
  }

  togglePlay(delay: AutoplayDelay): void {
    this.autoplay.toggle(delay);
    this.actionMenu(false);
  }

  toggleActionMenu = (): void => {
    this.actionMenu.toggle();
  };

  // SGF in and out (ADR 0023 §2, §5): read and written in the browser by libs/board.

  /** The whole tree as SGF, written again only when the tree changed. */
  sgf(): string {
    const c = this.sgfCache;
    if (c && c.root === this.root && c.version === this.version) return c.text;
    const text = writeTree(this.root);
    this.sgfCache = { root: this.root, version: this.version, text };
    return text;
  }

  /** Opens an SGF record's first game; says why not, with the move number, when it can't. */
  loadSgf(text: string): boolean {
    try {
      const root = readTree(text);
      this.sgfError = undefined;
      this.load(root);
      this.redraw();
      return true;
    } catch (e) {
      this.sgfError = errorText(e);
      this.redraw();
      return false;
    }
  }

  /** Opens an SGF file: UTF-8 unless its `CA` names another charset. */
  async loadSgfFile(file: File): Promise<void> {
    if (file.size > MAX_SGF_LENGTH * 4) {
      this.sgfError = 'That file is too big to be an SGF record.';
      return this.redraw();
    }
    this.loadSgf(decodeSgf(new Uint8Array(await file.arrayBuffer())));
  }

  /** Saves the whole tree (variations, comments, glyphs) as an SGF file. */
  downloadSgf = (): void => {
    const url = URL.createObjectURL(new Blob([this.sgf()], { type: 'application/x-go-sgf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ligo-analysis.sgf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Setup mode: a new position, with setup stones (ADR 0023 §1).

  startSetup = (): void => {
    const s = this.root.settings;
    this.autoplay.stop();
    this.actionMenu(false);
    this.setup = {
      size: s.size,
      ruleset: s.ruleset,
      komi: s.komi,
      black: [],
      white: [],
      toMove: 'black',
      color: 'black',
    };
    this.board.remount();
    this.redraw();
  };

  setSetupSize(size: Size): void {
    if (!this.setup || this.setup.size === size) return;
    this.setup = { ...this.setup, size, black: [], white: [], error: undefined };
    this.board.remount();
    this.redraw();
  }

  setSetupRuleset(ruleset: Ruleset, komi: number): void {
    if (!this.setup) return;
    this.setup.ruleset = ruleset;
    this.setup.komi = komi;
    this.setup.error = undefined;
    this.redraw();
  }

  setSetupKomi(komi: number): void {
    if (!this.setup) return;
    this.setup.komi = komi;
    this.setup.error = undefined;
    this.redraw();
  }

  setSetupColor(color: 'black' | 'white'): void {
    if (!this.setup) return;
    this.setup.color = color;
    this.board.editor?.setColor(color);
    this.redraw();
  }

  setSetupToMove(toMove: 'black' | 'white'): void {
    if (!this.setup) return;
    this.setup.toMove = toMove;
    this.redraw();
  }

  clearSetup = (): void => {
    if (!this.setup) return;
    this.setup = { ...this.setup, black: [], white: [], error: undefined };
    this.board.remount();
    this.redraw();
  };

  /** Starts analysing the position built, checked as any SGF root is (a stone without liberties is refused). */
  finishSetup = (): void => {
    if (!this.setup) return;
    try {
      this.sgfError = undefined;
      this.load(readTree(positionSgf(this.setup)));
    } catch (e) {
      this.setup.error = errorText(e);
    }
    this.redraw();
  };

  cancelSetup = (): void => {
    if (!this.setup) return;
    this.setup = undefined;
    this.board.remount();
    this.redraw();
  };
}

const plural = (noun: string, nb: number): string => `${nb} ${nb === 1 ? noun : noun + 's'}`;

/** An SGF refusal as the page says it: the reason, and the move number when a move is the cause. */
export function errorText(e: unknown): string {
  if (e instanceof SgfError) return e.move ? `Move ${e.move}: ${e.message}` : e.message;
  console.error(e);
  return 'That record could not be read.';
}
