// The analysis board's Go board: libs/board's `mountBoard` (goban's SVG board, ADR 0014), loaded
// lazily and mounted again for each position shown, as the round page does (ui/round
// `src/board.ts`): goban has no "view move n" of its own that keeps LiGo's move reporting. In setup
// mode the same element holds libs/board's position editor instead.
// Licence: MIT (LiGo's own code, ADR 0006).

import type { Board, BoardConfig } from '@ligo/board/board';
import type { Editor, EditorConfig } from '@ligo/board/editor';

interface Mounters {
  board: (el: HTMLElement, config: BoardConfig) => Board;
  editor: (el: HTMLElement, config: EditorConfig) => Editor;
}

/** goban's engine is ~100 KB gzipped (libs/board/README.md): load it only once the page needs it. */
const loadMounters = (): Promise<Mounters> =>
  Promise.all([import('@ligo/board/board'), import('@ligo/board/editor')]).then(([b, e]) => ({
    board: b.mountBoard,
    editor: e.mountEditor,
  }));

export type Shown = { board: BoardConfig } | { editor: EditorConfig };

export class AnalyseBoard {
  board?: Board;
  editor?: Editor;
  /** goban's chunk couldn't be loaded (offline, a deploy in between), or the position couldn't be drawn. */
  loadFailed = false;
  private el?: HTMLElement;
  private mounters?: Mounters;

  constructor(
    /** What the element should show now: the board at the position shown, or the editor. */
    private readonly shown: () => Shown,
    private readonly redraw: () => void,
    private readonly load: () => Promise<Mounters> = loadMounters,
  ) {}

  /** The view's `insert` hook: the element the board draws in. */
  attach = (el: HTMLElement): void => {
    this.el = el;
    if (this.mounters) return this.remount();
    this.load().then(
      mounters => {
        this.mounters = mounters;
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

  /** Draws the board (or the editor) again from `shown`. */
  remount = (): void => {
    this.unmount();
    if (!this.el || !this.mounters) return;
    const shown = this.shown();
    try {
      if ('editor' in shown) this.editor = this.mounters.editor(this.el, shown.editor);
      else this.board = this.mounters.board(this.el, shown.board);
    } catch (e) {
      console.error(e);
      this.loadFailed = true;
    }
  };

  private unmount(): void {
    this.board?.destroy();
    this.board = undefined;
    this.editor?.destroy();
    this.editor = undefined;
  }
}
