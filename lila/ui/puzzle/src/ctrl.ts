// The trainer page's controller (unit 8.7, ADR 0025 §3): lila's rated trainer on a Go puzzle. goban's
// puzzle mode (libs/board's `mountPuzzle`) follows the tree and says right or wrong; this holds what
// lila's page holds around it: the result and its rating change, the next puzzle, the votes, the
// session strip, and the solution a player may ask to see.

import { themeOf, type Theme } from '@ligo/board/themes';

import { toggle, myUserId } from 'lib';
import { type Deferred, defer } from 'lib/async';
import { isTouchDevice } from 'lib/device';
import { Coords } from 'lib/prefs';
import { pubsub } from 'lib/pubsub';
import { type StoredProp, storedBooleanProp, storedBooleanPropWithEffect } from 'lib/storage';
import { alert } from 'lib/view';
import { toggleZenMode } from 'lib/view/zen';

import { BoardHost, type Shown } from './board';
import { resolveConfirm } from './go';
import type { PuzzleData, PuzzleOpts, PuzzleReplay, PuzzleRound, ThemeKey } from './interfaces';
import * as keyboard from './keyboard';
import PuzzleSession from './session';
import { buildSolution, positionPuzzle, type Solution } from './solution';
import * as xhr from './xhr';

/** The board and stone themes the page was served with, or last chosen in the account menu. */
const themeOfPage = (): Theme => themeOf(document.body.dataset.board, document.body.dataset.pieceSet);

export type Mode = 'play' | 'try' | 'view';
export type Feedback = 'init' | 'good' | 'fail' | 'win';

type ReplayEnd = PuzzleReplay;

export default class PuzzleCtrl {
  data: PuzzleData;
  next: Deferred<PuzzleData | ReplayEnd> = defer<PuzzleData>();
  autoNext: StoredProp<boolean>;
  rated: StoredProp<boolean>;
  session: PuzzleSession;
  board: BoardHost;
  /** `play`: nothing decided yet; `try`: a wrong line was played (the loss is sent) and another try may go on; `view`: over. */
  mode: Mode = 'play';
  lastFeedback: Feedback = 'init';
  round?: PuzzleRound;
  resultSent = false;
  canViewSolution = toggle(false);
  voted?: boolean;
  /** A wrong line was played, or the solution was asked for: the puzzle is done, not "solved". */
  failed = false;
  isDaily = false;
  /** Taps only preview the stone; Confirm (or a second tap on it) plays it. */
  readonly confirm: boolean;
  theme: Theme = themeOfPage();
  /** The puzzle's right line, laid out once someone asks for it. */
  solution?: Solution;
  /** The solution is on show: the board draws its position `solutionStep`, and plays nothing. */
  solutionOpen = false;
  solutionStep = 0;
  /** The puzzle has no right line the page can lay out (never, for the generated set). */
  solutionMissing = false;
  private viewSolutionTimer?: ReturnType<typeof setTimeout>;

  constructor(
    readonly opts: PuzzleOpts,
    readonly redraw: Redraw,
  ) {
    this.rated = storedBooleanPropWithEffect('puzzle.rated', true, this.redraw);
    this.autoNext = storedBooleanProp('puzzle.autoNext', false);
    this.session = new PuzzleSession(opts.data.angle.key, myUserId());
    this.confirm = resolveConfirm(opts.pref.confirmMoves, isTouchDevice());
    this.data = opts.data;
    this.board = new BoardHost(this.shown, this.redraw);
    this.initiate(opts.data);
    keyboard.bind(this);
    pubsub.on('zen', toggleZenMode);
    pubsub.on('board.change', () => {
      this.theme = themeOfPage();
      this.board.api?.set({ theme: this.theme });
    });
    $('body').addClass('playing'); // for zen
    $('#zentog').on('click', () => pubsub.emit('zen'));
  }

  /** What the board element shows now: the puzzle to play, or a position of the solution to look at. */
  private readonly shown = (): Shown => {
    const node = this.solutionOpen ? this.solution?.[this.solutionStep] : undefined;
    return {
      puzzle: node ? positionPuzzle(this.data.puzzle, node) : this.data.puzzle,
      confirm: this.confirm && !node,
      coordinates: this.opts.pref.coords !== Coords.Hidden,
      theme: this.theme,
      onMove: (_move, by) => {
        if (this.solutionOpen) return;
        site.sound.play('move');
        // goban says "right" or "wrong" right after the stone that decides; until then the line is good.
        if (by === 'player' && this.mode !== 'view' && this.attempting()) this.lastFeedback = 'good';
      },
      onResult: r => (r === 'right' ? this.onRight() : this.onWrong()),
      onRefused: () => site.sound.play('error'),
      onChange: this.redraw,
    };
  };

  /** The player is the colour that moves first. */
  get pov(): Color {
    return this.data.puzzle.initial_player;
  }

  initiate = (fromData: PuzzleData): void => {
    this.data = fromData;
    this.next = defer();
    this.mode = 'play';
    this.round = undefined;
    this.resultSent = false;
    this.lastFeedback = 'init';
    this.failed = false;
    this.isDaily = !!fromData.isDaily;
    this.voted = undefined;
    this.solution = undefined;
    this.solutionOpen = false;
    this.solutionStep = 0;
    this.solutionMissing = false;
    this.canViewSolution(false);
    clearTimeout(this.viewSolutionTimer);
    // just to delay button display
    this.viewSolutionTimer = setTimeout(
      () => {
        this.canViewSolution(true);
        this.redraw();
      },
      this.rated() ? 4000 : 2000,
    );
    this.board.remount();
  };

  private readonly onRight = (): void => {
    if (this.solutionOpen) return;
    this.lastFeedback = 'win';
    if (this.mode !== 'view') {
      const sent = this.mode === 'play' ? this.sendResult(true) : Promise.resolve();
      this.mode = 'view';
      sent.then(() => {
        if (this.autoNext()) this.nextPuzzle();
      });
    }
    if (!this.failed) site.sound.say(i18n.puzzle.puzzleSuccess);
    this.redraw();
  };

  private readonly onWrong = (): void => {
    if (this.solutionOpen) return;
    this.lastFeedback = 'fail';
    this.failed = true;
    site.sound.say(i18n.puzzle.failed);
    if (this.mode === 'play') {
      this.canViewSolution(true);
      this.mode = 'try';
      this.sendResult(false);
    }
    this.redraw();
  };

  /** The attempt is under way and not decided: the line so far is right. */
  readonly attempting = (): boolean => this.board.api?.result() === undefined;

  /** The Confirm button shows while a stone waits to be played (touch-confirm). */
  movePending = (): boolean => !!this.board.api?.pending();

  confirmMove = (): void => this.board.api?.confirm();

  /** Another try at the same puzzle, after a wrong line. */
  retry = (): void => {
    if (this.mode === 'view') return;
    this.board.api?.retry();
    this.lastFeedback = 'init';
    this.redraw();
  };

  sendResult = async (win: boolean): Promise<void> => {
    if (this.resultSent) return Promise.resolve();
    this.resultSent = true;
    this.session.complete(this.data.puzzle.id, win);
    const res = await xhr.complete(
      this.data.puzzle.id,
      this.data.angle.key,
      win,
      this.rated(),
      this.data.replay,
    );
    const next = res.next;
    if (next?.user && this.data.user) {
      this.data.user.rating = next.user.rating;
      this.data.user.provisional = next.user.provisional;
      this.round = res.round;
      if (res.round?.ratingDiff) this.session.setRatingDiff(this.data.puzzle.id, res.round.ratingDiff);
    }
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

  /** "View the solution": the loss is sent as lila does, and the board steps through the right line. */
  viewSolution = (): void => {
    this.sendResult(false);
    if (this.lastFeedback !== 'win') this.failed = true;
    this.mode = 'view';
    this.solution ??= buildSolution(this.data.puzzle);
    this.solutionMissing = !this.solution;
    if (this.solution) {
      this.solutionOpen = true;
      this.solutionStep = Math.min(1, this.solution.length - 1);
      this.board.remount();
    }
    this.redraw();
  };

  /** Moves the solution's cursor: 0 is the puzzle's start, the last is the end of the line. */
  jumpSolution = (step: number): void => {
    if (!this.solutionOpen || !this.solution) return;
    const to = Math.max(0, Math.min(step, this.solution.length - 1));
    if (to === this.solutionStep) return;
    this.solutionStep = to;
    this.board.remount();
    site.sound.play('move');
    this.redraw();
  };

  vote = (v: boolean) => {
    xhr.vote(this.data.puzzle.id, v);
    this.voted = this.voted === v ? undefined : v;
    this.redraw();
  };

  voteTheme = (theme: ThemeKey, v: boolean) => {
    if (this.round) {
      this.round.themes = this.round.themes || {};
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

  /** A theme's name and description: the server translated them (the Go themes have no i18n keys). */
  themeName = (key: ThemeKey): string => this.opts.themeNames[key]?.name ?? key;
  themeDesc = (key: ThemeKey): string => this.opts.themeNames[key]?.desc ?? '';

  autoNexting = () => this.lastFeedback === 'win' && this.autoNext();
  allThemes = this.opts.themes && {
    dynamic: this.opts.themes.dynamic.split(' '),
    static: new Set(this.opts.themes.static.split(' ')),
  };
  toggleRated = () => this.rated(!this.rated());
  routerWithLang = (path: string): string => {
    if (document.body.hasAttribute('data-user')) return path;
    const language = document.documentElement.lang.slice(0, 2);
    return language === 'en' ? path : `/${language}${path}`;
  };
}
