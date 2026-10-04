// The puzzle's board (unit 8.7): libs/board's `mountPuzzle` (goban's own puzzle mode, unit 8.5), loaded
// lazily as the other Go pages load goban (~100 KB gzipped, libs/board/README.md) and mounted again for
// each puzzle and each position of the solution. goban follows the tree and says right or wrong;
// this only hands it the puzzle and the player's preferences.
// Licence: AGPL-3.0-or-later, like the rest of lila.

import type { PuzzleBoard, PuzzleConfig } from '@ligo/board/puzzle';

/** What the board should show now; the host asks for it each time it mounts. */
export type Shown = PuzzleConfig;

type Mount = (el: HTMLElement, config: PuzzleConfig) => PuzzleBoard;

const loadMount = (): Promise<Mount> => import('@ligo/board/puzzle').then(m => m.mountPuzzle);

export class BoardHost {
  api?: PuzzleBoard;
  /** goban's chunk couldn't be loaded (offline, a deploy in between), or the puzzle couldn't be drawn. */
  loadFailed = false;
  private el?: HTMLElement;
  private mount?: Mount;

  constructor(
    private readonly shown: () => Shown,
    private readonly redraw: () => void,
    private readonly load: () => Promise<Mount> = loadMount,
  ) {}

  /** The view's `insert` hook: the element the board draws in. */
  attach = (el: HTMLElement): void => {
    this.el = el;
    if (this.mount) return this.remount();
    this.load().then(
      mount => {
        this.mount = mount;
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
    this.unmount();
    this.el = undefined;
  };

  /** Draws the board again from `shown`: for the next puzzle, or another position of the solution. */
  remount = (): void => {
    this.unmount();
    if (!this.el || !this.mount) return;
    try {
      this.api = this.mount(this.el, this.shown());
    } catch (e) {
      console.error(e);
      this.loadFailed = true;
    }
  };

  private unmount(): void {
    this.api?.destroy();
    this.api = undefined;
  }
}
