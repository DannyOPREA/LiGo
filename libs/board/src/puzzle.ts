// LiGo's puzzle board (ADR 0025, PLAN unit 8.5): goban's own puzzle mode, which OGS's puzzle pages
// use, behind the same small API style as `mountBoard`. goban does the work: it shows the puzzle's
// setup within its `bounds`, follows the player's moves down the puzzle's tree, plays the
// opponent's reply itself (one of the tree's replies, at random), and says when a line ends right
// or wrong. LiGo adds three things:
//   - the result, reported once per attempt, after which the board takes no more moves until
//     `retry` (goban reports "wrong" again on every later move of a failed line);
//   - touch-confirm (unit 2.3): in puzzle mode goban places a stone on the first tap whatever its
//     submit settings, so with `confirm` on the board shows a see-through stone first and plays it
//     on a second tap of the same point, or on `confirm()`;
//   - goban's plain theme and the size handling of `mountBoard`.
// Licence: MIT (LiGo's own code, ADR 0006). goban: Apache-2.0 (COPYING.md, NOTICE.md).

import { SVGRenderer, type GobanConfig, type MoveTreeJson } from 'goban';

import { labels, PLAIN, type BoardState, type Color, type Move, type Refusal } from './board';
import { gameConfig, refusalOf, stateOf, toSgf } from './rules.mjs';

/** goban's puzzle JSON (ADR 0025 §1): the fields the board uses. tools/puzzles writes it. */
export interface Puzzle {
  width: number;
  height: number;
  /** The part of the board to show; the whole board when absent. */
  bounds?: { top: number; left: number; bottom: number; right: number };
  /** Setup stones as SGF points run together, e.g. `"aabbcc"`. */
  initial_state: { black: string; white: string };
  initial_player: Color;
  /** The root (`x: -1, y: -1`) and the lines; a line's last node is `correct_answer` or `wrong_answer`. */
  move_tree: MoveTreeJson;
  /** `free` (the default): any legal move; one off the tree is wrong. `fixed`: only the tree's moves. */
  puzzle_player_move_mode?: 'free' | 'fixed';
  /** `automatic` (the default): goban plays the opponent's reply. */
  puzzle_opponent_move_mode?: 'automatic' | 'manual';
}

export type Result = 'right' | 'wrong';

export interface PuzzleConfig {
  puzzle: Puzzle;
  /** A tap only previews the stone; a second tap on it, or `confirm()`, plays it. Default off. */
  confirm?: boolean;
  /** Letters and numbers on the board's shown edges. Default on. */
  coordinates?: boolean;
  /** How long goban waits before the opponent's reply, in milliseconds. Default 300 (goban's). */
  replyDelay?: number;
  /** A stone was played, by the player or by the puzzle's reply. */
  onMove?: (move: Move, by: 'player' | 'opponent') => void;
  /** The attempt ended: the line was right, or wrong (a wrong move, or a refutation played). */
  onResult?: (result: Result) => void;
  /** goban refused the player's move (a click on a stone is refused as occupied). */
  onRefused?: (reason: Refusal) => void;
  /** Something the page may show changed. */
  onChange?: () => void;
}

export interface PuzzleBoard {
  /** Back to the starting position for another attempt (after goban's pending reply, if any). */
  retry(): void;
  /** The moves played in this attempt, the player's and the replies, in order. */
  line(): Move[];
  /** How the attempt ended, or undefined while it goes on. */
  result(): Result | undefined;
  /** Whether a previewed stone waits for `confirm()`. */
  pending(): boolean;
  /** Plays the previewed stone. */
  confirm(): void;
  /** Turns touch-confirm on or off. */
  set(options: Pick<PuzzleConfig, 'confirm'>): void;
  /** The position shown. */
  state(): BoardState;
  destroy(): void;
}

/** Splits goban's run-together SGF points (`"aabb"`) into points. */
const points = (s: string): string[] => s.match(/../g) ?? [];

/** Mounts a puzzle in `el`, as wide as `el` and resized with it (as `mountBoard`). */
export function mountPuzzle(el: HTMLElement, config: PuzzleConfig): PuzzleBoard {
  const p = config.puzzle;
  if (p.width !== p.height) throw new Error(`puzzle is ${p.width}×${p.height}: LiGo boards are square`);
  const size = p.width;
  const bounds = p.bounds ?? { top: 0, left: 0, bottom: size - 1, right: size - 1 };
  const coordinates = config.coordinates ?? true;
  // goban draws a coordinate band only on the edges of the board that are shown.
  const across =
    bounds.right -
    bounds.left +
    1 +
    (coordinates && bounds.left === 0 ? 1 : 0) +
    (coordinates && bounds.right === size - 1 ? 1 : 0);
  const squareSize = () => Math.max(8, Math.floor(el.clientWidth / across));
  const boardDiv = el.appendChild(document.createElement('div'));
  let destroyed = false;

  const goban = new PuzzleGoban(
    {
      // LiGo's rule settings; komi and the ruleset don't matter to a puzzle.
      ...gameConfig({
        size: size as 9 | 13 | 19,
        ruleset: 'japanese',
        komi: 0,
        stones: { black: points(p.initial_state.black), white: points(p.initial_state.white) },
        toMove: p.initial_player,
      }),
      board_div: boardDiv,
      interactive: true,
      mode: 'puzzle',
      bounds,
      move_tree: p.move_tree,
      puzzle_player_move_mode: p.puzzle_player_move_mode ?? 'free',
      puzzle_opponent_move_mode: p.puzzle_opponent_move_mode ?? 'automatic',
      puzzle_autoplace_delay: config.replyDelay,
      getPuzzlePlacementSetting: () => ({ mode: 'play' }),
      square_size: squareSize(),
      ...labels(coordinates),
      dont_show_messages: true,
      onError: e => console.error(e),
    },
    !!config.confirm,
    reason => config.onRefused?.(reason),
  );

  const player = p.initial_player;
  let result: Result | undefined;
  let retryAfterReply = false;
  const finish = (r: Result) => {
    if (result || destroyed) return;
    result = r;
    goban.setFinished(true);
    config.onResult?.(r);
    config.onChange?.();
  };
  const restart = () => {
    retryAfterReply = false;
    result = undefined;
    goban.restart();
    config.onChange?.();
  };

  goban.on('puzzle-place', ({ x, y, color }) => {
    // goban gives the colour to move after the stone, so the stone is the other colour's.
    const by = color === player ? 'opponent' : 'player';
    if (!destroyed) config.onMove?.(toSgf({ x, y }), by);
    // A retry asked for while goban's reply was on its way waits for the reply (goban's timer
    // can't be cancelled), then runs once goban has finished with it.
    if (retryAfterReply) queueMicrotask(restart);
  });
  goban.on('puzzle-correct-answer', () => finish('right'));
  goban.on('puzzle-wrong-answer', () => finish('wrong'));
  goban.on('update', () => destroyed || config.onChange?.());

  const resize = new ResizeObserver(() => {
    const s = squareSize();
    if (s !== goban.square_size) goban.setSquareSize(s);
  });
  resize.observe(el);

  return {
    retry: () => {
      if (goban.replying()) retryAfterReply = true;
      else restart();
    },
    line: () => goban.line(),
    result: () => result,
    pending: () => goban.pending(),
    confirm: () => goban.confirmPreview(),
    set: options => {
      if (options.confirm !== undefined) goban.setConfirm(options.confirm);
    },
    state: () => stateOf(goban.engine),
    destroy: () => {
      destroyed = true;
      resize.disconnect();
      goban.destroy();
      boardDiv.remove();
    },
  };
}

/** goban's SVG board in puzzle mode, with LiGo's theme, a finished state and touch-confirm. */
class PuzzleGoban extends SVGRenderer {
  private confirmMode: boolean;
  private finished = false;
  /** The previewed point and colour, while touch-confirm waits for a second tap. */
  private preview?: { x: number; y: number; mark: 'black' | 'white' };
  /** Set while LiGo itself hands a confirmed tap to goban. */
  private confirming = false;

  constructor(config: GobanConfig, confirm: boolean, refused: (reason: Refusal) => void) {
    super(config);
    this.confirmMode = confirm;
    const handle = this.errorHandler;
    this.errorHandler = e => {
      const reason = refusalOf(e);
      if (reason) refused(reason);
      else handle(e);
    };
    // Taps for touch-confirm: before goban's own handlers, which ignore them while placement is off.
    this.parent.addEventListener('pointerup', this.onPointerUp);
    this.updateTitleAndStonePlacement();
  }

  protected override getSelectedThemes(): typeof PLAIN {
    return PLAIN;
  }

  /**
   * goban turns stone placement back on after every change in puzzle mode; it stays off once the
   * attempt has ended, and with touch-confirm on (LiGo's own tap handler previews the stone).
   */
  override updateTitleAndStonePlacement(): void {
    super.updateTitleAndStonePlacement();
    if (this.finished || (this.confirmMode && !this.confirming)) this.disableStonePlacement();
  }

  override destroy(): void {
    this.parent?.removeEventListener('pointerup', this.onPointerUp);
    super.destroy();
  }

  setFinished(finished: boolean): void {
    this.finished = finished;
    this.dropPreview();
    this.updateTitleAndStonePlacement();
  }

  setConfirm(on: boolean): void {
    this.confirmMode = on;
    this.dropPreview();
    this.updateTitleAndStonePlacement();
  }

  /** Whether goban's reply is waiting on its timer. */
  replying(): boolean {
    return (this as unknown as { autoplaying_puzzle_move: boolean }).autoplaying_puzzle_move;
  }

  pending(): boolean {
    return !!this.preview;
  }

  /** Plays the previewed stone through goban's own tap handling. */
  confirmPreview(): void {
    const at = this.preview;
    if (!at) return;
    this.dropPreview();
    this.confirming = true;
    try {
      this.enableStonePlacement();
      this.tapAt(at.x, at.y, false);
    } finally {
      this.confirming = false;
      this.updateTitleAndStonePlacement();
    }
  }

  /** Back to the start of the tree for another attempt. */
  restart(): void {
    this.dropPreview();
    this.finished = false;
    this.engine.jumpTo(this.engine.move_tree);
    this.updateTitleAndStonePlacement();
    this.redraw(true);
    this.emit('update');
  }

  /** The moves from the start of the tree to the position shown. */
  line(): Move[] {
    const moves: Move[] = [];
    for (let n = this.engine.cur_move; n.parent; n = n.parent)
      moves.unshift(n.x < 0 ? 'pass' : toSgf({ x: n.x, y: n.y }));
    return moves;
  }

  private onPointerUp = (ev: PointerEvent): void => {
    if (!this.confirmMode || this.finished || ev.button !== 0 || this.replying()) return;
    const rect = this.parent.getBoundingClientRect();
    const pt = this.xy2ij(ev.clientX - rect.left, ev.clientY - rect.top);
    if (!pt.valid || pt.i < 0 || pt.j < 0 || pt.i >= this.width || pt.j >= this.height) return;
    const at = this.preview;
    if (at && at.x === pt.i && at.y === pt.j) {
      this.confirmPreview();
      return;
    }
    this.dropPreview();
    if (this.engine.board[pt.j][pt.i]) return; // goban shows nothing for a tap on a stone either
    this.preview = { x: pt.i, y: pt.j, mark: this.engine.colorToMove() };
    this.setCustomMark(pt.i, pt.j, this.preview.mark, true);
    this.emit('update');
  };

  private dropPreview(): void {
    const at = this.preview;
    if (!at) return;
    this.preview = undefined;
    this.deleteCustomMark(at.x, at.y, at.mark, true);
    this.emit('update');
  }
}
