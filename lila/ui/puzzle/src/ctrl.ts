import { Result } from '@badrap/result';
import type { DrawShape } from '@lichess-org/chessground/draw';
import { uciToMove } from '@lichess-org/chessground/util';
import { Chess, normalizeMove } from 'chessops/chess';
import { chessgroundDests } from 'chessops/compat';
import { parseFen, makeFen } from 'chessops/fen';
import { makeSanAndPlay } from 'chessops/san';
import type { Role, Move, Outcome } from 'chessops/types';
import { parseSquare, parseUci, makeSquare, makeUci, opposite } from 'chessops/util';

import { prop, type Prop, propWithEffect, type Toggle, toggle, requestIdleCallbackSafe, myUserId } from 'lib';
import { type Deferred, defer } from 'lib/async';
import { plyColor } from 'lib/game/chess';
import { endgameShapes } from 'lib/game/endgame';
import { type WithGround } from 'lib/game/ground';
import { PromotionCtrl } from 'lib/game/promotion';
import { pubsub } from 'lib/pubsub';
import { type StoredProp, storedBooleanProp, storedBooleanPropWithEffect } from 'lib/storage';
import { makeTree, treeOps, treePath, type TreeWrapper } from 'lib/tree';
import { completeNode } from 'lib/tree/node';
import { last } from 'lib/tree/ops';
import type { TreeNode, TreePath } from 'lib/tree/types';
import { alert } from 'lib/view';
import { toggleZenMode } from 'lib/view/zen';

import computeAutoShapes from './autoShape';
import type {
  PuzzleOpts,
  PuzzleData,
  MoveTest,
  ThemeKey,
  ReplayEnd,
  PuzzleRound,
  RoundThemes,
} from './interfaces';
import keyboard from './keyboard';
import moveTest from './moveTest';
import { pgnToTree, mergeSolution, nextCorrectMove } from './moveTree';
import PuzzleSession from './session';
import * as xhr from './xhr';

export default class PuzzleCtrl {
  data: PuzzleData;
  next: Deferred<PuzzleData | ReplayEnd> = defer<PuzzleData>();
  tree: TreeWrapper;
  autoNext: StoredProp<boolean>;
  rated: StoredProp<boolean>;
  ground: Prop<CgApi> = prop<CgApi | undefined>(undefined) as Prop<CgApi>;
  session: PuzzleSession;
  menu: Toggle;
  flipped = toggle(false);
  googlyEyes?: () => DrawShape[];
  promotion: PromotionCtrl;
  keyboardHelp: Prop<boolean>;
  cgConfig?: CgConfig;
  path: TreePath;
  node: TreeNode;
  nodeList: TreeNode[];
  mainline: TreeNode[];
  initialPath: TreePath;
  initialNode: TreeNode;
  pov: Color;
  mode: 'play' | 'view' | 'try';
  round?: PuzzleRound;
  resultSent: boolean;
  lastFeedback: 'init' | 'fail' | 'win' | 'good' | 'retry';
  canViewSolution = toggle(false);
  showHint = toggle(false);
  hintHasBeenShown = toggle(false);
  voted?: boolean;
  autoScrollRequested: boolean;
  autoScrollNow: boolean;
  isDaily: boolean;
  blindfolded: StoredProp<boolean>;
  cgVersion = 0;

  constructor(
    readonly opts: PuzzleOpts,
    readonly redraw: Redraw,
  ) {
    this.rated = storedBooleanPropWithEffect('puzzle.rated', true, this.redraw);
    this.autoNext = storedBooleanProp('puzzle.autoNext', false);
    this.blindfolded = storedBooleanProp(`puzzle.${myUserId() || 'anon'}.blindfolded`, false);
    this.session = new PuzzleSession(opts.data.angle.key, myUserId());
    this.menu = toggle(false, redraw);

    this.initiate(opts.data);
    this.promotion = new PromotionCtrl(
      this.withGround,
      () => this.withGround(g => g.set(this.cgConfig!)),
      redraw,
    );

    this.keyboardHelp = propWithEffect(location.hash === '#keyboard', this.redraw);
    keyboard(this);

    // If the page loads while being hidden (like when changing settings),
    // chessground is not displayed, and the first move is not fully applied.
    // Make sure chessground is fully shown when the page goes back to being visible.
    document.addEventListener('visibilitychange', () =>
      requestIdleCallbackSafe(() => this.jump(this.path), 500),
    );
    pubsub.on('board.change', (is3d: boolean) => {
      this.withGround(g => {
        g.state.addPieceZIndex = is3d;
        g.redrawAll();
      });
      this.setAutoShapes();
    });
    pubsub.on('zen', toggleZenMode);
    $('body').addClass('playing'); // for zen
    $('#zentog').on('click', () => pubsub.emit('zen'));
    (window as any).lichess.puzzle = {
      playUci: (uci: Uci) => this.sendMove(parseUci(uci)!),
    };
    (window as any).lichess.chessground = this.ground;
  }

  private readonly loadSound = (name: string, volume?: number) => {
    site.sound.load(name, site.sound.url(`${name}.mp3`));
    return () => site.sound.play(name, volume);
  };
  sound = {
    good: this.loadSound('sfx/Confirmation', 0.7),
    end: this.loadSound('sfx/Victory', 1),
  };

  setPath = (path: TreePath): void => {
    this.path = path;
    this.nodeList = this.tree.getNodeList(path);
    this.node = treeOps.last(this.nodeList)!;
    this.mainline = treeOps.mainlineNodeList(this.tree.root);
    this.showHint(false);
  };

  setChessground = (cg: CgApi): void => {
    this.ground(cg);
    requestAnimationFrame(() => this.redraw());

    this.googlyEyesAuto();
  };

  googlyEyesStart: () => void = () => {
    if (!this.googlyEyes)
      this.withGround(cg => {
        site.asset
          .loadEsm('bits.googlyHorsey', {
            init: { cg, redraw: this.setAutoShapes },
          })
          .then(({ makeGooglyShapes }: { makeGooglyShapes: () => DrawShape[] }) => {
            this.googlyEyes = makeGooglyShapes;
            this.setAutoShapes();
          });
      });
  };

  private readonly googlyEyesAuto = () => {
    if (this.isDaily && new Date().getMonth() === 3 && new Date().getDate() === 1) this.googlyEyesStart();
  };

  pref = this.opts.pref;

  withGround: WithGround = f => {
    const g = this.ground();
    return g ? f(g) : undefined;
  };

  initiate = (fromData: PuzzleData): void => {
    this.data = fromData;
    this.tree = makeTree(pgnToTree(this.data.game.pgn.split(' ')));
    const initialPath = treePath.fromNodeList(treeOps.mainlineNodeList(this.tree.root));
    this.mode = 'play';
    this.next = defer();
    this.round = undefined;
    this.resultSent = false;
    this.lastFeedback = 'init';
    this.initialPath = initialPath;
    this.initialNode = this.tree.nodeAtPath(initialPath);
    this.pov = plyColor(this.initialNode.ply);
    this.isDaily = !!this.data.isDaily;
    this.hintHasBeenShown(false);
    this.canViewSolution(false);
    this.voted = undefined;

    this.setPath(site.blindMode ? initialPath : treePath.init(initialPath));
    setTimeout(
      () => {
        this.jump(initialPath);
        this.redraw();
      },
      this.opts.pref.animation.duration > 0 ? 500 : 0,
    );

    // just to delay button display
    setTimeout(
      () => {
        this.canViewSolution(true);
        this.redraw();
      },
      this.rated() ? 4000 : 2000,
    );

    this.cgVersion++;
  };

  position = (): Chess => {
    const setup = parseFen(this.node.fen).unwrap();
    return Chess.fromSetup(setup).unwrap();
  };

  makeCgOpts = (): CgConfig => {
    const node = this.node;
    const color = plyColor(node.ply);
    const dests = chessgroundDests(this.position());
    const nextNode = this.node.children[0];
    const canMove = this.mode === 'view' || (color === this.pov && (!nextNode || nextNode.puzzle === 'fail'));
    const movable = canMove
      ? {
          color: dests.size > 0 ? color : undefined,
          dests,
        }
      : {
          color: undefined,
          dests: new Map(),
        };

    const config = {
      fen: node.fen,
      orientation: this.flipped() ? opposite(this.pov) : this.pov,
      turnColor: color,
      movable,
      premovable: {
        enabled: false,
      },
      check: node.check(),
      lastMove: uciToMove(node.uci),
    };
    if (node.ply >= this.initialNode.ply) {
      if (this.mode !== 'view' && color !== this.pov && !nextNode) {
        config.movable.color = this.pov;
        config.premovable.enabled = true;
      }
    }
    this.cgConfig = config;
    return config;
  };

  showGround = (g: CgApi): void => {
    g.set(this.makeCgOpts());
    this.setAutoShapes();
  };

  pluginMove = (orig: Key, dest: Key, role?: Role) => {
    if (role) this.playUserMove(orig, dest, role);
    else
      this.withGround(g => {
        g.move(orig, dest);
        g.state.movable.dests = undefined;
        g.state.turnColor = opposite(g.state.turnColor);
      });
  };

  userMove = (orig: Key, dest: Key): void => {
    const isPromoting = this.promotion.start(orig, dest, {
      submit: this.playUserMove,
    });
    if (!isPromoting) this.playUserMove(orig, dest);
  };

  playUci = (uci: Uci): void => this.sendMove(parseUci(uci)!);

  playUserMove = (orig: Key, dest: Key, promotion?: Role): void =>
    this.sendMove({
      from: parseSquare(orig)!,
      to: parseSquare(dest)!,
      promotion,
    });

  sendMove = (move: Move): void => this.sendMoveAt(this.path, this.position(), move);

  sendMoveAt = (path: TreePath, pos: Chess, move: Move): void => {
    move = normalizeMove(pos, move);
    const san = makeSanAndPlay(pos, move);
    this.addNode(
      completeNode('standard')({
        ply: 2 * (pos.fullmoves - 1) + (pos.turn === 'white' ? 0 : 1),
        fen: makeFen(pos.toSetup()),
        uci: makeUci(move),
        san,
        pos: () => Result.ok(pos),
      }),
      path,
    );
  };

  addNode = (node: TreeNode, path: TreePath): void => {
    const newPath = this.tree.addNode(node, path)!;
    this.jump(newPath);
    this.withGround(g => g.playPremove());

    const progress = moveTest(this);
    this.setAutoShapes();
    if (progress === 'fail') site.sound.say(i18n.puzzle.failed);
    if (progress) this.applyProgress(progress);
    this.reorderChildren(path);
    this.redraw();
  };

  reorderChildren = (path: TreePath, recursive?: boolean): void => {
    const node = this.tree.nodeAtPath(path);
    node.children.sort((c1, _) => {
      const p = c1.puzzle;
      if (p === 'fail') return 1;
      if (p === 'good' || p === 'win') return -1;
      return 0;
    });
    if (recursive) node.children.forEach(child => this.reorderChildren(path + child.id, true));
  };

  private readonly instantRevertUserMove = (): void => {
    this.withGround(g => {
      g.cancelPremove();
      g.selectSquare(null);
    });
    this.jump(treePath.init(this.path));
    this.redraw();
  };

  revertUserMove = (): void => {
    if (site.blindMode) this.instantRevertUserMove();
    else setTimeout(this.instantRevertUserMove, 300);
  };

  applyProgress = (progress: undefined | 'fail' | 'win' | MoveTest): void => {
    if (progress === 'fail') {
      this.lastFeedback = 'fail';
      this.revertUserMove();
      if (this.mode === 'play') {
        this.canViewSolution(true);
        this.mode = 'try';
        this.sendResult(false);
      }
    } else if (progress === 'win') {
      this.lastFeedback = 'win';
      if (this.mode !== 'view') {
        const sent = this.mode === 'play' ? this.sendResult(true) : Promise.resolve();
        this.mode = 'view';
        this.withGround(this.showGround);
        sent.then(_ => {
          if (this.autoNext()) this.nextPuzzle();
        });
      }
    } else if (progress) {
      this.lastFeedback = 'good';
      setTimeout(
        () => {
          const pos = Chess.fromSetup(parseFen(progress.fen).unwrap()).unwrap();
          this.sendMoveAt(progress.path, pos, progress.move);
        },
        this.opts.pref.animation.duration * (this.autoNext() ? 1 : 1.5),
      );
    }
  };

  sendResult = async (win: boolean): Promise<void> => {
    if (this.resultSent) return Promise.resolve();
    this.resultSent = true;
    this.session.complete(this.data.puzzle.id, win);
    const res = await xhr.complete(
      this.data.puzzle.id,
      this.data.angle.key,
      win,
      this.rated() && !this.hintHasBeenShown(),
      this.data.replay,
      this.opts.settings.color,
    );
    const next = res.next;
    if (next?.user && this.data.user) {
      this.data.user.rating = next.user.rating;
      this.data.user.provisional = next.user.provisional;
      this.round = res.round;
      if (res.round?.ratingDiff) this.session.setRatingDiff(this.data.puzzle.id, res.round.ratingDiff);
    }
    if (win) site.sound.say(i18n.puzzle.puzzleSuccess);
    if (next) {
      this.next.resolve(this.data.replay && res.replayComplete ? this.data.replay : next);
    }
    this.redraw();
    if (!next && !this.data.replay) {
      await alert('No more puzzles available! Try another theme.');
      site.redirect('/training/themes');
    }
  };

  private readonly isPuzzleData = (d: PuzzleData | ReplayEnd): d is PuzzleData => 'puzzle' in d;

  nextPuzzle = (): void => {
    if (this.mode !== 'view') return;

    this.next.promise.then(n => {
      if (this.isPuzzleData(n)) {
        this.initiate(n);
        this.redraw();
      }
    });

    if (this.data.replay && this.round === undefined) {
      site.redirect(`/training/dashboard/${this.data.replay.days}`);
    }

    if (!this.data.replay) {
      const path = this.routerWithLang(`/training/${this.data.angle.key}`);
      if (location.pathname !== path) history.replaceState(null, '', path);
    }
  };

  setAutoShapes = (): void =>
    this.withGround(g =>
      g.setAutoShapes([
        ...computeAutoShapes({
          ...this,
          node: this.node,
          hint: this.hintSquare(),
        }),
        ...(this.lastFeedback === 'win' && this.node.outcome()
          ? endgameShapes(
              this.node.fen,
              this.node.outcome()?.winner,
              this.node.outcome()?.winner ? 'mate' : 'stalemate',
            )
          : []),
      ]),
    );

  hintSquare = () => {
    const hint = this.showHint() ? nextCorrectMove(this) : undefined;
    return hint?.from;
  };

  // (unit 3.5) no local engine: only the server's stored best move is used
  nextNodeBest = () => treeOps.withMainlineChild(this.node, n => n.eval?.best);

  outcome = (): Outcome | undefined => this.position().outcome();

  jump = (path: TreePath): void => {
    const pathChanged = path !== this.path,
      isForwardStep = pathChanged && path.length === this.path.length + 2;
    this.setPath(path);
    this.withGround(this.showGround);
    if (pathChanged) {
      if (isForwardStep) {
        site.sound.saySan(this.node.san);
        site.sound.move(this.node);
      }
    }
    this.promotion.cancel();
    this.autoScrollRequested = true;
    pubsub.emit('ply', this.node.ply);
  };

  userJump = (path: TreePath): void => {
    if (this.tree.nodeAtPath(path)?.puzzle === 'fail' && this.mode !== 'view') return;
    this.withGround(g => g.selectSquare(null));
    this.jump(path);
  };

  userJumpPlyDelta = (plyDelta: Ply) => {
    // ensure we are jumping to a valid ply
    let maxValidPly = this.mainline.length - 1;
    if (last(this.mainline)?.puzzle === 'fail' && this.mode !== 'view') maxValidPly -= 1;
    const newPly = Math.min(Math.max(this.node.ply + plyDelta, 0), maxValidPly);
    this.userJump(treePath.fromNodeList(this.mainline.slice(0, newPly + 1)));
  };

  toggleHint = (): void => {
    if (!this.showHint()) {
      this.hintHasBeenShown(true);
      this.userJump(treePath.fromNodeList(this.mainline.filter(node => node.puzzle !== 'fail')));
    }
    this.showHint.toggle();
    this.setAutoShapes();
    const hint = this.hintSquare();
    this.withGround(g => g.selectSquare(hint ? makeSquare(hint) : null));
    this.redraw();
  };

  viewSolution = (): void => {
    this.sendResult(false);
    this.mode = 'view';
    mergeSolution(this.tree, this.initialPath, this.data.puzzle.solution, this.pov);
    this.reorderChildren(this.initialPath, true);

    // try to play the solution next move
    const next = this.node.children[0];
    if (next?.puzzle === 'good') this.userJump(this.path + next.id);
    else {
      const firstGoodPath = treeOps.takePathWhile(this.mainline, node => node.puzzle !== 'good');
      if (firstGoodPath) this.userJump(firstGoodPath + this.tree.nodeAtPath(firstGoodPath).children[0].id);
    }

    this.autoScrollRequested = true;
    this.redraw();
  };

  flip = () => {
    this.flipped.toggle();
    this.cgVersion++;
    this.withGround(g => g.toggleOrientation());
    this.redraw();
  };

  vote = (v: boolean) => {
    xhr.vote(this.data.puzzle.id, v);
    this.voted = this.voted === v ? undefined : v;
    this.redraw();
  };

  voteTheme = (theme: ThemeKey, v: boolean) => {
    if (this.round) {
      this.round.themes = this.round.themes || ({} as RoundThemes);
      if (v === this.round.themes[theme]) {
        delete this.round.themes[theme];
        xhr.voteTheme(this.data.puzzle.id, theme, undefined);
      } else {
        if (v || this.data.puzzle.themes.includes(theme)) this.round.themes[theme] = v;
        else delete this.round.themes[theme];
        xhr.voteTheme(this.data.puzzle.id, theme, v);
      }
      this.redraw();
    }
  };
  blindfold = (v?: boolean): boolean => {
    if (v !== undefined && v !== this.blindfolded()) {
      this.blindfolded(v);
      this.redraw();
    }
    return this.blindfolded();
  };
  autoNexting = () => this.lastFeedback === 'win' && this.autoNext();
  getOrientation = () => this.withGround(g => g.state.orientation)!;
  allThemes = this.opts.themes && {
    dynamic: this.opts.themes.dynamic.split(' '),
    static: new Set(this.opts.themes.static.split(' ')),
  };
  toggleRated = () => this.rated(!this.rated());
  getNode = () => this.node;
  showEvaluation = () => this.mode === 'view';
  routerWithLang = (path: string): string => {
    if (document.body.hasAttribute('data-user')) return path;
    const language = document.documentElement.lang.slice(0, 2);
    return language === 'en' ? path : `/${language}${path}`;
  };
}
