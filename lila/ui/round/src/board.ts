// The round's Go board: libs/board's `mountBoard` (goban's SVG board, ADR 0014), loaded lazily and
// mounted in the element snabbdom gives it. To show an earlier position the board is mounted again
// with fewer moves, as the playground's undo does: goban has no "view move n" of its own that keeps
// LiGo's move reporting intact. Licence: MIT (LiGo's own code, ADR 0006).

import type { Board, BoardConfig } from '@ligo/board/board';

type MountBoard = (el: HTMLElement, config: BoardConfig) => Board;

/** goban's engine is ~100 KB gzipped (libs/board/README.md): load it only once the page needs it. */
const loadMountBoard = (): Promise<MountBoard> => import('@ligo/board/board').then(m => m.mountBoard);

export class RoundBoard {
  board?: Board;
  /** goban's chunk couldn't be loaded (offline, a deploy in between). */
  loadFailed = false;
  private el?: HTMLElement;
  private mountBoard?: MountBoard;

  constructor(
    /** The board as it should be now: the moves up to the ply shown, who may move, the look. */
    private readonly config: () => BoardConfig,
    private readonly redraw: () => void,
    private readonly load: () => Promise<MountBoard> = loadMountBoard,
  ) {}

  /** The view's `insert` hook: the element the board draws in. */
  attach = (el: HTMLElement): void => {
    this.el = el;
    if (this.mountBoard) return this.remount();
    this.load().then(
      mountBoard => {
        this.mountBoard = mountBoard;
        this.remount();
        this.redraw();
      },
      (e: unknown) => {
        console.error(e);
        this.loadFailed = true;
        this.redraw();
      },
    );
  };

  /** The view's `destroy` hook. */
  detach = (el: HTMLElement): void => {
    if (this.el !== el) return;
    this.board?.destroy();
    this.board = undefined;
    this.el = undefined;
  };

  /** Draws the board again from `config` (another ply, a reloaded game). */
  remount = (): void => {
    this.board?.destroy();
    this.board = this.el && this.mountBoard ? this.mountBoard(this.el, this.config()) : undefined;
  };
}
