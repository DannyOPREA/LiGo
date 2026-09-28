// Local Go playground (unit 2.2): play both colours on one board. No server game, no clock,
// nothing stored - every setting resets to LiGo's defaults on reload.
import type { Board, BoardConfig, Move } from '@ligo/board/board';
import { handicapStones, standardKomi } from '@ligo/board/rules';

/** goban's engine is ~100 KB gzipped (libs/board/README.md): load it only once the page needs it. */
const loadMountBoard = () => import('@ligo/board/board').then(m => m.mountBoard);

import type { GameSettings, PlaygroundConfig, Redraw, Ruleset, Size } from './interfaces';

const defaultSettings = (): GameSettings => ({
  size: 9,
  ruleset: 'japanese',
  handicap: 0,
  komi: standardKomi('japanese', 0),
});

export default class PlaygroundCtrl {
  /** The settings the board on screen was built with. */
  settings: GameSettings = defaultSettings();
  /** The form's own choices; only "New game" applies them to `settings`. */
  pending: GameSettings = { ...this.settings };
  moves: Move[] = [];
  board?: Board;
  /** goban's chunk couldn't be loaded (offline, a deploy in between). */
  loadFailed = false;
  /** Bumped on every remount so the view gives the board container a fresh key (destroy + insert). */
  generation = 0;

  constructor(
    readonly config: PlaygroundConfig,
    readonly redraw: Redraw,
  ) {
    this.moves = [...(config.moves ?? [])];
  }

  /** Handicap stones for `settings`, as the board's `stones` (R-HCP-3/4; none below 2 stones). */
  private handicapStonesOf(settings: GameSettings): { black: string[]; white: string[] } {
    return {
      black: settings.handicap >= 2 ? handicapStones(settings.size, settings.handicap) : [],
      white: [],
    };
  }

  boardConfig = (): BoardConfig => {
    const { size, ruleset, handicap, komi } = this.settings;
    const stones = this.handicapStonesOf(this.settings);
    return {
      size,
      ruleset,
      komi,
      handicap,
      stones,
      toMove: stones.black.length ? 'white' : 'black',
      moves: this.moves,
      movable: 'both',
      onMove: this.onMove,
      onChange: this.redraw,
    };
  };

  /** Mounted by the view's `insert` hook; loads goban's board lazily (see `loadMountBoard`). */
  mount = (el: HTMLElement): void => {
    const generation = this.generation;
    loadMountBoard().then(
      mountBoard => {
        // the container was already replaced (a remount, or the page moved on) before this arrived
        if (generation !== this.generation) return;
        this.board = mountBoard(el, this.boardConfig());
        this.redraw();
      },
      (e: unknown) => {
        console.error(e);
        this.loadFailed = true;
        this.redraw();
      },
    );
  };

  private readonly onMove = (move: Move): void => {
    this.board?.play(move);
    this.moves.push(move);
    this.redraw();
  };

  pass = (): void => this.board?.pass();

  /** The game just ended in two consecutive passes; scoring is Phase 4, so play may go on. */
  get bothPassed(): boolean {
    const n = this.moves.length;
    return n >= 2 && this.moves[n - 1] === 'pass' && this.moves[n - 2] === 'pass';
  }

  canUndo = (): boolean => this.moves.length > 0;

  undo = (): void => {
    if (!this.canUndo()) return;
    this.moves = this.moves.slice(0, -1);
    this.remount();
  };

  setPendingSize = (size: Size): void => {
    this.pending = { ...this.pending, size };
    // R-HCP-4 has no fixed placements for 13x13 yet (R-SCOPE-1): drop any pending handicap.
    if (size === 13 && this.pending.handicap > 0) this.setPendingHandicap(0);
  };

  setPendingRuleset = (ruleset: Ruleset): void => {
    this.pending = { ...this.pending, ruleset, komi: standardKomi(ruleset, this.pending.handicap) };
  };

  setPendingHandicap = (handicap: number): void => {
    this.pending = { ...this.pending, handicap, komi: standardKomi(this.pending.ruleset, handicap) };
  };

  /** R-KOMI-4: a multiple of 0.5, at most the board's number of points either way. */
  komiLimit = (): number => this.pending.size * this.pending.size;

  /** Ignores what isn't a komi (a blank or half-typed field) rather than reading it as 0. */
  setPendingKomi = (komi: number): void => {
    if (!Number.isFinite(komi) || Math.abs(komi) > this.komiLimit() || (komi * 2) % 1 !== 0) return;
    this.pending = { ...this.pending, komi };
  };

  newGame = (): void => {
    this.settings = { ...this.pending };
    this.moves = [];
    this.remount();
  };

  private readonly remount = (): void => {
    this.board?.destroy();
    this.board = undefined;
    this.generation++;
    this.redraw();
  };
}
