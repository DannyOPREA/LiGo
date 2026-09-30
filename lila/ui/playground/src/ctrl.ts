// Local Go playground (unit 2.2): play both colours on one board. No server game, no clock,
// game settings reset to LiGo's defaults on reload; only the board look is kept in local storage
// (ADR 0026 §3).
import type { Board, BoardConfig, Move, Played } from '@ligo/board/board';
import { handicapStones, standardKomi } from '@ligo/board/rules';
import { BOARD_THEMES, DEFAULT_THEME, STONE_THEMES, type Theme } from '@ligo/board/themes';

import { isTouchDevice } from 'lib/device';
import { storedStringProp } from 'lib/storage';

/** goban's engine is ~100 KB gzipped (libs/board/README.md): load it only once the page needs it. */
const loadMountBoard = () => import('@ligo/board/board').then(m => m.mountBoard);

import type { GameSettings, PlaygroundConfig, Redraw, Ruleset, Size } from './interfaces';

/** `Pref.ConfirmMoves` (lila/modules/pref): kept in step by hand, it's a small fixed set. */
const ConfirmMoves = { NEVER: 0, TOUCH: 1, ALWAYS: 2 } as const;

/** Whether taps only preview, for a `Pref.ConfirmMoves` value on this kind of device. */
export const resolveConfirm = (confirmMoves: number, touch: boolean): boolean =>
  confirmMoves === ConfirmMoves.ALWAYS || (confirmMoves === ConfirmMoves.TOUCH && touch);

/**
 * The sound for a move that counted, from lila's sound sets (ADR 0026 §2): a stone is lila's "Move",
 * one that takes stones "Capture", a pass "Confirmation".
 */
export const soundOf = (played: Played): string =>
  played.move === 'pass' ? 'confirmation' : played.captured > 0 ? 'capture' : 'move';

/** A stored name that is still offered, else the default (names can change between releases). */
const pick = <T extends string>(stored: string, offered: readonly T[], fallback: T): T =>
  (offered as readonly string[]).includes(stored) ? (stored as T) : fallback;

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
  /**
   * `Pref.ConfirmMoves` (unit 2.3), resolved once against this browser: a tap previews the stone
   * and `confirmMove` plays it (a mouse double click too; goban ignores double taps on touch).
   */
  readonly confirm: boolean;
  /**
   * The board's look (ADR 0026 §3), kept in this browser until lila's board preferences carry
   * Go themes (unit 9.7). Applies at once, to the board on screen too.
   */
  private readonly storedBoardTheme = storedStringProp('playground.board-theme', DEFAULT_THEME.board);
  private readonly storedStoneTheme = storedStringProp('playground.stone-theme', DEFAULT_THEME.stones);
  theme: Theme = {
    board: pick(this.storedBoardTheme(), BOARD_THEMES, DEFAULT_THEME.board),
    stones: pick(this.storedStoneTheme(), STONE_THEMES, DEFAULT_THEME.stones),
  };
  /** Plays one of lila's sounds by name; the sound preference, volume and "silent" apply. */
  sound: (name: string) => void = name => void site.sound.play(name);

  constructor(
    readonly config: PlaygroundConfig,
    readonly redraw: Redraw,
  ) {
    this.moves = [...(config.moves ?? [])];
    const confirmMoves = config.confirmMoves ?? ConfirmMoves.TOUCH;
    this.confirm = resolveConfirm(confirmMoves, isTouchDevice());
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
      confirm: this.confirm,
      theme: this.theme,
      onMove: this.onMove,
      onPlayed: played => this.sound(soundOf(played)),
      onRefused: () => this.sound('error'),
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

  setTheme = (theme: Partial<Theme>): void => {
    this.theme = { ...this.theme, ...theme };
    this.storedBoardTheme(this.theme.board);
    this.storedStoneTheme(this.theme.stones);
    this.board?.set({ theme: this.theme });
  };

  pass = (): void => this.board?.pass();

  /** Whether a previewed stone is waiting for `confirmMove` (confirm mode only). */
  movePending = (): boolean => this.board?.pending() ?? false;

  /** Plays the previewed stone (the "Confirm move" button). */
  confirmMove = (): void => this.board?.confirm();

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
