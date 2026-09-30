import { Result } from '@badrap/result';
import type { Api as ChessgroundApi } from '@lichess-org/chessground/api';
import type { Config as ChessgroundConfig } from '@lichess-org/chessground/config';
import { uciToMove } from '@lichess-org/chessground/util';
import { makeFen } from 'chessops/fen';
import type { PgnError } from 'chessops/pgn';
import { makeSanAndPlay } from 'chessops/san';
import { isNormal, type Move } from 'chessops/types';
import { opposite, parseUci, makeSquare, roleToChar, makeUci, parseSquare } from 'chessops/util';
import { normalizeMove } from 'chessops/variant';

import {
  defined,
  toggle,
  debounce,
  throttle,
  requestIdleCallbackSafe,
  propWithEffect,
  type Prop,
  type Toggle,
} from 'lib';
import { ChatCtrl } from 'lib/chat/chatCtrl';
import { playable, playedTurns, validUci, finished } from 'lib/game';
import { plyColor } from 'lib/game/chess';
import { PromotionCtrl } from 'lib/game/promotion';
import { pubsub } from 'lib/pubsub';
import { makeTree, treePath, treeOps, type TreeWrapper } from 'lib/tree';
import { completeNode } from 'lib/tree/node';
import type { ServerEval, TreeNode, TreePath } from 'lib/tree/types';
import { confirm } from 'lib/view';

import { Autoplay, type AutoplayDelay } from './autoplay';
import { compute as computeAutoShapes } from './autoShape';
import { valid as crazyValid } from './crazy/crazyCtrl';
import ForecastCtrl from './forecast/forecastCtrl';
import { ForkCtrl } from './fork';
import { IdbTree } from './idbTree';
import type { AnalyseOpts, AnalyseData, JustCaptured, NvuiPlugin } from './interfaces';
import * as keyboard from './keyboard';
import MotifCtrl from './motif/motifCtrl';
import Navigate from './navigate';
import { nextGlyphSymbol, add3or5FoldGlyphs } from './nodeFinder';
import pgnImport from './pgnImport';
import { SettingsCtrl } from './settingsCtrl';
import { make as makeSocket, type Socket } from './socket';
import { TreeView } from './treeView/treeView';
import { treeReconstruct, addCrazyData } from './util';
import { plural } from './view/util';
import wikiTheory, { wikiClear, type WikiTheory } from './wiki';

export default class AnalyseCtrl {
  data: AnalyseData;
  element: HTMLElement;
  tree: TreeWrapper;
  socket: Socket;
  chessground: ChessgroundApi;
  navigate: Navigate;
  idbTree: IdbTree = new IdbTree(this);
  actionMenu: Toggle = toggle(false);
  isEmbed: boolean;

  // current tree state, cursor, and denormalized node lists
  path: TreePath;
  node: TreeNode;
  nodeList: TreeNode[];
  mainline: TreeNode[];

  // sub controllers
  autoplay: Autoplay;
  forecast?: ForecastCtrl;
  fork: ForkCtrl;
  promotion: PromotionCtrl;
  chatCtrl?: ChatCtrl;
  wiki?: WikiTheory;
  motif: MotifCtrl;

  // state flags
  justPlayed?: string; // pos
  justDropped?: string; // role
  justCaptured?: JustCaptured;
  redirecting = false;
  onMainline = true;
  synthetic: boolean; // false if coming from a real game
  ongoing: boolean; // true if real game is ongoing
  asyncReady = false; // cannot accurately draw movelist until this is true

  // display flags
  flipped = false;
  showComments = true; // whether to display comments in the move tree
  settings: SettingsCtrl;
  keyboardHelp: boolean = location.hash === '#keyboard';

  treeView: TreeView;
  cgVersion = {
    js: 1, // increment to recreate chessground
    dom: 1,
  };

  // underboard inputs
  fenInput?: string;
  pgnInput?: string;
  pgnError?: string;

  // other paths
  initialPath: TreePath;
  contextMenuPath?: TreePath;
  gamePath?: TreePath;
  pendingCopy: Prop<{ eventPath: TreePath; withVariations: boolean } | null>;
  pendingDeletionPath: Prop<TreePath | null>;

  // misc
  requestInitialPly?: number; // start ply from the URL location hash
  cgConfig: any; // latest chessground config (useful for revert)
  nvui?: NvuiPlugin;

  constructor(
    readonly opts: AnalyseOpts,
    readonly redraw: Redraw,
  ) {
    this.data = opts.data;
    this.element = opts.element;
    this.isEmbed = !!opts.embed;
    this.settings = new SettingsCtrl(() => {
      this.setAutoShapes();
      this.redraw();
    });
    this.treeView = new TreeView(this);
    this.navigate = new Navigate(this);
    this.promotion = new PromotionCtrl(
      this.withCg,
      () => this.withCg(g => g.set(this.cgConfig)),
      this.redraw,
    );
    this.motif = new MotifCtrl(this.settings);

    if (this.data.forecast) this.forecast = new ForecastCtrl(this.data.forecast, this.data, redraw);
    if (this.opts.wiki) this.wiki = wikiTheory();
    if (site.blindMode)
      site.asset.loadEsm<NvuiPlugin>('analyse.nvui', { init: this }).then(nvui => {
        this.nvui = nvui;
        this.redraw();
      });

    if (opts.inlinePgn) this.data = this.changePgn(opts.inlinePgn, false) || this.data;

    this.initialize(this.data, false);
    this.pendingCopy = propWithEffect(null, this.redraw);
    this.pendingDeletionPath = propWithEffect(null, this.redraw);
    this.initialPath = this.makeInitialPath();
    this.setPath(this.initialPath);

    this.showGround();
    this.resetAutoShapes();

    if (location.hash === '#menu') requestIdleCallbackSafe(this.actionMenu.toggle, 500);
    keyboard.bind(this);

    if (this.opts.chat && !this.isEmbed) {
      this.chatCtrl = new ChatCtrl(
        { ...this.opts.chat, enhance: { plies: true, boards: false } },
        this.redraw,
      );
    }
    pubsub.on('jump', (ply: string) => {
      this.jumpToMain(parseInt(ply));
      this.redraw();
    });

    pubsub.on('ply.trigger', () =>
      pubsub.emit('ply', this.node.ply, this.tree.lastMainlineNode(this.path).ply === this.node.ply),
    );
    pubsub.on('analysis.chart.click', index => {
      this.jumpToIndex(index);
      this.redraw();
    });
    pubsub.on('board.change', (is3d: boolean) => {
      if (this.chessground) {
        this.chessground.state.addPieceZIndex = is3d;
        this.chessground.redrawAll();
        redraw();
      }
    });
    (window as any).lichess.analysis = {
      playUci: this.playUci,
      navigate: this.navigate,
    };
    (window as any).lichess.chessground = () => this.chessground;
  }

  initialize(data: AnalyseData, merge: boolean): void {
    this.data = data;
    this.synthetic = data.game.id === 'synthetic';
    this.ongoing = !this.synthetic && playable(data);
    const prevTree = merge && this.tree.root;
    this.tree = makeTree(treeReconstruct(this.data.treeParts, this.variantKey, this.data.sidelines));
    if (prevTree) this.tree.merge(prevTree);
    treeOps.updateAll(this.tree.root, this.ensureServerEvalNodes);
    const mainline = treeOps.mainlineNodeList(this.tree.root);
    if (this.data.game.status.name === 'draw') {
      if (add3or5FoldGlyphs(mainline)) this.data.game.threefold = true;
    }

    this.autoplay = new Autoplay(this);
    this.socket ??= makeSocket(this.opts.socketSend, this);
    this.gamePath = this.synthetic || this.ongoing ? undefined : treePath.fromNodeList(mainline);
    this.fork = new ForkCtrl(this);

    site.sound.preloadBoardSounds();
    this.asyncLoadThenShow();
  }

  get variantKey(): VariantKey {
    return this.data.game.variant.key;
  }

  private readonly makeInitialPath = (): TreePath => {
    // if correspondence, always use latest actual move to set 'current' style
    if (this.ongoing) return treePath.fromNodeList(treeOps.mainlineNodeList(this.tree.root));
    const loc = window.location,
      hashPly = loc.hash === '#last' ? this.tree.lastPly() : parseInt(loc.hash.slice(1)),
      startPly = hashPly >= 0 ? hashPly : this.opts.inlinePgn ? this.tree.lastPly() : undefined;
    if (defined(startPly)) {
      // remove location hash - https://stackoverflow.com/questions/1397329/how-to-remove-the-hash-from-window-location-with-javascript-without-page-refresh/5298684#5298684
      window.history.replaceState(null, '', loc.pathname + loc.search);
      this.requestInitialPly = startPly;
      const mainline = treeOps.mainlineNodeList(this.tree.root);
      return treeOps.takePathWhile(mainline, n => n.ply <= startPly);
    } else return treePath.root;
  };

  enableWiki = (v: boolean) => {
    this.wiki = v ? wikiTheory() : undefined;
    if (this.wiki) this.wiki(this.nodeList);
    else wikiClear();
  };

  private readonly setPath = (path: TreePath): void => {
    this.path = path;
    this.nodeList = this.tree.getNodeList(path);
    this.node = treeOps.last(this.nodeList) as TreeNode;
    this.mainline = treeOps.mainlineNodeList(this.tree.root);
    this.onMainline = this.tree.pathIsMainline(path);
    this.fenInput = undefined;
    this.pgnInput = undefined;
    if (this.wiki && this.data.game.variant.key === 'standard') this.wiki(this.nodeList);
    this.idbTree.saveMoves();
    this.idbTree.revealNode();
  };

  flip = () => {
    this.flipped = !this.flipped;
    this.chessground?.set({
      orientation: this.bottomColor(),
    });
    this.onChange();
    this.redraw();
  };

  topColor(): Color {
    return opposite(this.bottomColor());
  }

  bottomColor(): Color {
    if (this.data.game.variant.key === 'racingKings') return this.flipped ? 'black' : 'white';
    return this.flipped ? opposite(this.data.orientation) : this.data.orientation;
  }

  bottomIsWhite = () => this.bottomColor() === 'white';

  getOrientation(): Color {
    return this.bottomColor();
  }

  getNode(): TreeNode {
    return this.node;
  }

  turnColor(): Color {
    return plyColor(this.node.ply);
  }

  togglePlay(delay: AutoplayDelay): void {
    this.autoplay.toggle(delay);
    this.actionMenu(false);
  }

  private showGround(): void {
    this.withCg(cg => {
      cg.set(this.makeCgOpts());
      this.setAutoShapes();
      if (this.node.shapes) cg.setShapes(this.node.shapes.slice());
      cg.playPremove();
    });
    this.onChange();
  }

  serverMainline = () => this.mainline.slice(0, playedTurns(this.data) + 1);

  makeCgOpts(): ChessgroundConfig {
    const node = this.node,
      color = this.turnColor(),
      dests = this.node.dests(),
      drops = this.node.drops(),
      movableColor = dests.size || drops?.length ? color : undefined,
      config: ChessgroundConfig = {
        fen: node.fen,
        turnColor: color,
        movable: {
          color: movableColor,
          dests: (movableColor === color && dests) || new Map(),
        },
        check: node.check(),
        lastMove: uciToMove(node.uci),
      };
    config.premovable = {
      enabled: config.movable!.color && config.turnColor !== config.movable!.color,
    };
    this.cgConfig = config;
    return config;
  }

  setChessground = (cg: CgApi) => {
    this.chessground = cg;

    this.setAutoShapes();
    if (this.node.shapes) this.chessground.setShapes(this.node.shapes.slice());
    this.cgVersion.dom = this.cgVersion.js;
  };

  private readonly onChange: () => void = throttle(300, () => {
    pubsub.emit('analysis.change', this.node.fen, this.path);
  });

  private readonly updateHref: () => void = debounce(() => {
    window.history.replaceState(null, '', '#' + this.node.ply);
  }, 750);

  playedLastMoveMyself = () =>
    !!this.justPlayed && !!this.node.uci && this.node.uci.startsWith(this.justPlayed);

  jump(path: TreePath): void {
    const pathChanged = path !== this.path,
      isForwardStep = pathChanged && path.length === this.path.length + 2;
    if (this.path !== path)
      this.treeView.requestAutoScroll(treeOps.distance(this.path, path) > 8 ? 'instant' : 'smooth');
    this.setPath(path);
    if (pathChanged) {
      if (isForwardStep) {
        const isAtomicCapture = this.data.game.variant.key === 'atomic' && !!this.node.san?.includes('x');
        if (isAtomicCapture) site.sound.play('explosion');
        else site.sound.move(this.node);
      }
      site.sound.saySan(this.node.san, true);
    }
    this.justPlayed = this.justDropped = this.justCaptured = undefined;
    this.updateHref();
    this.promotion.cancel();
    pubsub.emit('ply', this.node.ply, this.tree.lastMainlineNode(this.path).ply === this.node.ply);
    this.showGround();
  }

  userJump = (path: TreePath): void => {
    this.autoplay.stop();
    if (!this.gamebookPlay()) this.withCg(cg => cg.selectSquare(null));
    this.jump(path);
  };

  canJumpTo = (_path: TreePath): boolean => true;

  userJumpIfCan(path: TreePath, sideStep = false): void {
    if (path === this.path || !this.canJumpTo(path)) return;
    if (sideStep) {
      // when stepping lines, anchor the chessground animation at the parent
      this.node = this.tree.nodeAtPath(path.slice(0, -2));
      this.chessground?.set(this.makeCgOpts());
      this.chessground?.state.dom.redrawNow(true);
    }
    this.userJump(path);
  }

  mainlinePlyToPath(ply: Ply): TreePath {
    return treeOps.takePathWhile(this.mainline, n => n.ply <= ply);
  }

  jumpToMain = (ply: Ply): void => {
    this.userJump(this.mainlinePlyToPath(ply));
  };

  jumpToIndex = (index: number): void => {
    this.jumpToMain(index + 1 + this.tree.root.ply);
  };

  jumpToGlyphSymbol(color: Color, symbol: string): void {
    const node = nextGlyphSymbol(color, symbol, this.mainline, this.node.ply);
    if (node) this.jumpToMain(node.ply);
    this.redraw();
  }

  reloadData(data: AnalyseData, merge: boolean): void {
    this.initialize(data, merge);
    this.redirecting = false;
    this.setPath(treePath.root);
    this.cgVersion.js++;
  }

  changePgn(pgn: string, andReload: boolean): AnalyseData | undefined {
    this.pgnError = '';
    try {
      const data: AnalyseData = {
        ...pgnImport(pgn),
        orientation: this.bottomColor(),
        pref: this.data.pref,
      } as AnalyseData;
      if (andReload) {
        this.reloadData(data, false);
        this.userJump(this.mainlinePlyToPath(this.tree.lastPly()));
        this.redraw();
      }
      return data;
    } catch (err) {
      this.pgnError = (err as PgnError).message;
      requestAnimationFrame(this.redraw);
    }
    return undefined;
  }

  changeFen(fen: FEN): void {
    this.redirecting = true;
    window.location.href =
      '/analysis/' +
      this.data.game.variant.key +
      '/' +
      encodeURIComponent(fen).replace(/%20/g, '_').replace(/%2F/g, '/');
  }

  crazyValid = (role: Role, key: Key): boolean => {
    const color = this.chessground.state.movable.color;
    return (
      (color === 'white' || color === 'black') &&
      crazyValid(this.chessground, this.node.drops(), { color, role }, key)
    );
  };

  sendNewPiece = (role: Role, key: Key): void => {
    const color = this.chessground.state.movable.color;
    if (color === 'white' || color === 'black') this.userNewPiece({ color, role }, key);
  };

  userNewPiece = (piece: Piece, pos: Key): void => {
    if (crazyValid(this.chessground, this.node.drops(), piece, pos)) {
      this.justPlayed = roleToChar(piece.role).toUpperCase() + '@' + pos;
      this.justDropped = piece.role;
      this.justCaptured = undefined;
      this.addNodeLocally({
        role: piece.role,
        to: parseSquare(pos)!,
      });
    } else this.jump(this.path);
  };

  userMove = (orig: Key, dest: Key, capture?: JustCaptured): void => {
    this.justPlayed = orig;
    this.justDropped = undefined;
    if (
      !this.promotion.start(orig, dest, {
        submit: (orig, dest, prom) => this.sendMove(orig, dest, capture, prom),
      })
    )
      this.sendMove(orig, dest, capture);
  };

  sendMove = (orig: Key, dest: Key, capture?: JustCaptured, prom?: Role): void => {
    if (capture) this.justCaptured = capture;
    this.addNodeLocally({
      from: parseSquare(orig)!,
      to: parseSquare(dest)!,
      promotion: prom,
    });
  };

  onPremoveSet = () => {};

  private addNodeLocally(move: Move): void {
    const pos = this.node.pos().unwrap().clone();
    move = normalizeMove(pos, move);
    const san = makeSanAndPlay(pos, move);
    const node = completeNode(this.variantKey)({
      ply: this.node.ply + 1,
      uci: makeUci(move),
      san,
      fen: makeFen(pos.toSetup()),
      pos: () => Result.ok(pos),
    });
    addCrazyData(node, pos);
    this.addNode(node, this.path);
  }

  addNode(node: TreeNode, path: TreePath) {
    this.idbTree.onAddNode(node, path);
    const newPath = this.tree.addNode(node, path);
    if (!newPath) {
      console.log("Can't addNode", node, path);
      return this.redraw();
    }

    this.jump(newPath);

    this.redraw();
    this.chessground.playPremove();
  }

  async deleteNode(path: TreePath): Promise<void> {
    this.pendingDeletionPath(null);
    const node = this.tree.nodeAtPath(path);
    if (!node) return;
    const count = treeOps.countChildrenAndComments(node);
    if (
      (count.nodes >= 10 || count.comments > 0) &&
      !(await confirm(
        'Delete ' +
          plural('move', count.nodes) +
          (count.comments ? ' and ' + plural('comment', count.comments) : '') +
          '?',
      ))
    )
      return;
    this.tree.deleteNodeAt(path);
    if (treePath.contains(this.path, path)) this.userJump(treePath.init(path));
    else this.jump(this.path);
    this.redraw();
  }

  isPendingCopy(path: TreePath, isMainline: boolean): boolean {
    const pending = this.pendingCopy();
    if (!pending) return false;
    const { eventPath, withVariations } = pending;
    return withVariations ? treePath.areComparable(path, eventPath) : isMainline;
  }

  // (unit 3.5) only a stored server evaluation can be shown; there is no local engine
  allowedEval(node: TreeNode = this.node): ServerEval | false | undefined {
    return this.settings.showStaticAnalysis && node.eval;
  }

  motifEnabled = (): boolean => this.motif.supports(this.data.game.variant.key);

  async pruneToMainline(path: TreePath): Promise<void> {
    const nodeList = this.tree.getNodeList(path);
    for (let i = 0; i < nodeList.length - 1; i++) {
      if (nodeList[i].forceVariation) delete nodeList[i].forceVariation;
      nodeList[i].children = [nodeList[i + 1]];
    }
    this.jump(path);
    this.redraw();
  }

  promote(path: TreePath, toMainline: boolean): void {
    this.tree.promoteAt(path, toMainline);
    this.jump(path);
  }

  forceVariation(path: TreePath, force: boolean): void {
    this.tree.forceVariationAt(path, force);
    this.jump(path);
  }

  visibleChildren(node = this.node): TreeNode[] {
    return node.children.filter(
      kid => !kid.comp || this.settings.showStaticAnalysis || treeOps.contains(kid, this.node),
    );
  }

  reset(): void {
    this.showGround();
    this.redraw();
  }

  encodeNodeFen(): FEN {
    return this.node.fen.replace(/\s/g, '_');
  }

  nextNodeBest() {
    return treeOps.withMainlineChild(this.node, (n: TreeNode) => validUci(n.eval?.best));
  }

  setAutoShapes = (): void => {
    if (!site.blindMode) this.chessground?.setAutoShapes(computeAutoShapes(this));
  };

  // (unit 3.5) whether a stored analysis may be shown (not during a live game)
  isEvalAllowed = () => !this.ongoing && (this.synthetic || !playable(this.data));

  showVariationArrows() {
    if (!this.allowLines() || !this.settings.showVariationArrows) return false;
    return Boolean(this.node.children.filter(x => !x.comp || this.settings.showStaticAnalysis).length);
  }

  showEvaluation() {
    return this.settings.showStaticAnalysis;
  }

  showMoveGlyphs = (): boolean => this.settings.showStaticAnalysis;

  showMoveAnnotations = (): boolean => this.settings.showMoveAnnotationsOnBoard && this.showMoveGlyphs();

  activeControlBarTool() {
    return this.actionMenu() ? 'action-menu' : false;
  }

  allowLines() {
    return true;
  }

  toggleDiscloseOf(path = this.path.slice(0, -2)) {
    const disclose = this.idbTree.discloseOf(this.tree.nodeAtPath(path), this.tree.pathIsMainline(path));
    if (disclose) this.idbTree.setCollapsed(path, disclose === 'expanded');
    return Boolean(disclose);
  }

  toggleActionMenu = () => {
    this.actionMenu.toggle();
  };

  gamebookPlay = (): undefined => undefined;

  isGamebook = (): boolean => false;

  withCg = <A>(f: (cg: ChessgroundApi) => A): A | undefined =>
    this.chessground && this.cgVersion.js === this.cgVersion.dom ? f(this.chessground) : undefined;

  playUci = (uci: Uci) => {
    const move = parseUci(uci)!;
    const to = makeSquare(move.to);
    if (isNormal(move)) {
      const piece = this.chessground.state.pieces.get(makeSquare(move.from));
      const capture = this.chessground.state.pieces.get(to);
      this.sendMove(
        makeSquare(move.from),
        to,
        capture && piece && capture.color !== piece.color ? capture : undefined,
        move.promotion,
      );
    } else
      this.chessground.newPiece(
        {
          color: this.chessground.state.movable.color as Color,
          role: move.role,
        },
        to,
      );
  };

  pluginMove = (orig: Key, dest: Key, prom: Role | undefined): void => {
    const capture = this.chessground.state.pieces.get(dest);
    this.sendMove(orig, dest, capture, prom);
  };

  showBestMoveArrows = () => this.settings.showBestMoveArrows;

  private readonly resetAutoShapes = () => {
    if (
      this.showBestMoveArrows() ||
      this.settings.showMoveAnnotationsOnBoard ||
      this.settings.showVariationArrows ||
      (this.motifEnabled() && this.motif.any()) ||
      (finished(this.data) && this.node.outcome())
    )
      this.setAutoShapes();
    else this.chessground?.setAutoShapes([]);
  };

  private readonly ensureServerEvalNodes = (node: TreeNode) => {
    if (node.eval && !node.eval.knodes && this.data.analysis?.nodesPerMove)
      node.eval.knodes = this.data.analysis.nodesPerMove / 1000;
  };

  private async asyncLoadThenShow() {
    this.asyncReady = false;
    const tree = this.tree;
    await this.idbTree.load();
    if (this.tree !== tree) return;
    this.asyncReady = true;
    this.idbTree.revealNode();
    this.setAutoShapes();
    this.redraw();
  }
}
