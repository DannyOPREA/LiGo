// LiGo's Go board: OGS goban's SVG renderer (npm `goban`, pinned, ADR 0014) behind a small
// chessground-like API, so lila's snabbdom views mount it in an `insert` hook and never touch goban.
// goban plays the moves; LiGo's code decides which ones count. When the player picks a move the
// board reports it (`onMove`) and waits: whoever owns the game (the server, or a local page) plays
// it back with `play`, or turns it down with `cancel`. Moves from the other side arrive by `play`
// too. goban's own play code expects OGS's socket; a stand-in socket carries `play` to it instead.
// Licence: MIT (LiGo's own code, ADR 0006). goban: Apache-2.0 (COPYING.md, NOTICE.md).

import { SVGRenderer, type GobanConfig, type GobanSelectedThemes, type MoveCommand } from 'goban';

import { gameConfig, refusalOf, stateOf, toXY, type BoardState, type Game } from './rules.mjs';

export type { BoardState, Game };

export type Color = 'black' | 'white';
/** An SGF point such as `"dd"` (column, then row, from the top left), or `"pass"`. */
export type Move = string;
export type Refusal = 'occupied' | 'suicide' | 'superko';

export interface BoardConfig extends Game {
  /** Moves already played, in order, after the starting stones. */
  moves?: Move[];
  /** Who may place stones here: one colour, both (a local game), or nobody. Default nobody. */
  movable?: Color | 'both' | 'none';
  /**
   * A tap only previews the stone; `confirm()` (or a mouse double click) plays it, and a second
   * tap on the preview takes it back. goban ignores double taps on touch screens. Default off.
   */
  confirm?: boolean;
  /** Letters and numbers round the board. Default on. */
  coordinates?: boolean;
  /** The player picked a move the rules allow. Answer with `play(move)` or `cancel()`. */
  onMove?: (move: Move) => void;
  /** goban refused the player's move before reporting it (a click on a stone is just ignored). */
  onRefused?: (reason: Refusal) => void;
  /** Something the page may show changed: the position, a preview waiting, whose turn it is. */
  onChange?: () => void;
}

export interface Board {
  /**
   * Plays a move on the board, the player's (after `onMove`) or the opponent's. The caller is the
   * referee: goban plays what it is given (a suicide too), and a move it can't place changes nothing.
   */
  play(move: Move): void;
  /** Takes back the move the player picked, when it didn't count. */
  cancel(): void;
  /** The player passes (reported through `onMove`, like a stone). */
  pass(): void;
  /** Whether a previewed stone waits for `confirm()`. */
  pending(): boolean;
  /** Plays the previewed stone (reported through `onMove`). */
  confirm(): void;
  /** Changes who may move, or whether taps only preview. */
  set(options: Pick<BoardConfig, 'movable' | 'confirm'>): void;
  /** The position after the last move played (a preview doesn't count). */
  state(): BoardState;
  destroy(): void;
}

/**
 * goban's plain board and stones: drawn in colour, no images. goban's default (Kaya, Slate, Shell)
 * loads its wood picture from OGS's CDN, and its image themes wait for a licence check (logs/board-ui.md).
 */
const PLAIN: GobanSelectedThemes = {
  board: 'Plain',
  black: 'Plain',
  white: 'Plain',
  'removal-graphic': 'x',
  'removal-scale': 1,
};

const GAME_ID = 1;
const IDS = { black: 1, white: 2 } as const;

/**
 * Mounts a board in `el`, as wide as `el` and resized with it (goban sizes the element it draws in,
 * so it draws in a child of `el`, and the page's CSS gives `el` its width).
 */
export function mountBoard(el: HTMLElement, config: BoardConfig): Board {
  const boardDiv = el.appendChild(document.createElement('div'));
  // goban draws the coordinates in a square-wide band on each side.
  const squares = (config.coordinates ?? true) ? config.size + 2 : config.size;
  const squareSize = () => Math.max(8, Math.floor(el.clientWidth / squares));
  const socket = new StandInSocket();
  let destroyed = false;
  const goban = new LigoGoban(
    {
      ...gameConfig(config),
      board_div: boardDiv,
      interactive: true,
      mode: 'play',
      game_id: GAME_ID,
      players: { black: { id: IDS.black, username: 'Black' }, white: { id: IDS.white, username: 'White' } },
      moves: (config.moves ?? []).map(move => toXY({ width: config.size, height: config.size }, move)),
      square_size: squareSize(),
      ...labels(config.coordinates ?? true),
      dont_show_messages: true,
      one_click_submit: !config.confirm,
      double_click_submit: !!config.confirm,
      server_socket: socket as unknown as GobanConfig['server_socket'],
      onError: e => console.error(e),
    },
    move => destroyed || config.onMove?.(move),
    reason => config.onRefused?.(reason),
  );
  goban.setMovable(config.movable ?? 'none');
  goban.on('update', () => config.onChange?.());
  goban.on('submit_move', () => config.onChange?.());

  const resize = new ResizeObserver(() => {
    const size = squareSize();
    if (size !== goban.square_size) goban.setSquareSize(size);
  });
  resize.observe(el);

  return {
    play: move => {
      toXY(goban.engine, move); // throws on a malformed or off-board move, before anything changes
      goban.dropPreview();
      const before = goban.engine.last_official_move;
      goban.handTurnOver();
      socket.receive(`game/${GAME_ID}/move`, {
        game_id: GAME_ID,
        move_number: goban.engine.getMoveNumber() + 1,
        move: toGoban(move),
      });
      // goban logs a move it can't place (an occupied point) and carries on: the turn stays.
      if (goban.engine.last_official_move === before) goban.dropPreview();
    },
    cancel: () => goban.dropPreview(),
    pass: () => {
      if (goban.pending()) goban.dropPreview();
      if (goban.mayMove()) goban.pass();
    },
    pending: () => goban.pending(),
    confirm: () => goban.submit_move?.(),
    set: options => {
      if (options.confirm !== undefined) {
        goban.one_click_submit = !options.confirm;
        goban.double_click_submit = options.confirm;
      }
      if (options.movable !== undefined) goban.setMovable(options.movable);
    },
    state: () => goban.officialState(),
    destroy: () => {
      destroyed = true;
      resize.disconnect();
      goban.destroy();
      boardDiv.remove();
    },
  };
}

/** goban's SVG board, with its moves going to LiGo instead of OGS's server. */
class LigoGoban extends SVGRenderer {
  private movable: Color | 'both' | 'none' = 'none';
  /** A move was reported and neither `play` nor `cancel` has answered it yet. */
  private awaiting = false;

  constructor(
    config: GobanConfig,
    private readonly report: (move: Move) => void,
    refused: (reason: Refusal) => void,
  ) {
    super(config);
    // goban shows its own message for a refused move and tells `onError` about some of them only
    // (not suicide); every refusal goes through this handler.
    const handle = this.errorHandler;
    this.errorHandler = e => {
      const reason = refusalOf(e);
      if (reason) refused(reason);
      else handle(e);
    };
  }

  /**
   * goban's own `sendMove` talks OGS's protocol and needs an OGS clock (memo 1.2). The move is
   * reported once goban has finished with it (it turns stone placement off after sending), so the
   * page may play it back straight away.
   */
  protected override sendMove(mv: MoveCommand): boolean {
    const move = fromGoban(mv.move);
    // goban turns placement off after a stone but not after a pass: no second move while this one waits.
    this.awaiting = true;
    this.disableStonePlacement();
    queueMicrotask(() => this.report(move));
    return true;
  }

  protected override getSelectedThemes(): GobanSelectedThemes {
    return PLAIN;
  }

  setMovable(movable: Color | 'both' | 'none'): void {
    this.movable = movable;
    if (this.awaiting) return; // placement stays off until the reported move is answered
    // The turn is the last played move's, not a previewed stone's.
    this.player_id = this.idFor(this.officialState().toMove);
    // goban turns placement off while a preview is shown (it isn't the last move played): keep the
    // preview if the player may still move, else take it back.
    if (this.pending() && this.player_id !== 0) return;
    if (this.pending()) this.dropPreview();
    this.updateTitleAndStonePlacement();
    this.redraw();
  }

  pending(): boolean {
    return !!this.submit_move;
  }

  /**
   * goban lets a player place stones only on their own turn (`player_id`), and works that out
   * while a move arrives: the id has to name the next player before the move is handed over.
   */
  handTurnOver(): void {
    this.player_id = this.idFor(this.engine.colorToMove() === 'black' ? 'white' : 'black');
  }

  mayMove(): boolean {
    return !this.awaiting && this.player_id !== 0 && this.engine.cur_move === this.engine.last_official_move;
  }

  /** Removes a previewed or reported move that wasn't played, back to the last move played. */
  dropPreview(): void {
    const tentative = this.engine.cur_move;
    delete this.move_selected;
    this.submit_move = undefined;
    this.awaiting = false;
    this.engine.jumpToLastOfficialMove();
    if (tentative !== this.engine.cur_move) tentative.removeIfNoChildren();
    this.player_id = this.idFor(this.engine.colorToMove());
    this.updateTitleAndStonePlacement();
    this.redraw();
    this.emit('update');
  }

  officialState(): BoardState {
    const here = this.engine.cur_move;
    if (here === this.engine.last_official_move) return stateOf(this.engine);
    this.engine.jumpToLastOfficialMove();
    try {
      return stateOf(this.engine);
    } finally {
      this.engine.jumpTo(here);
    }
  }

  private idFor(toMove: Color): number {
    // 0 is "nobody": goban compares it with the id of the player to move, which is never 0.
    return this.movable === 'both' || this.movable === toMove ? IDS[toMove] : 0;
  }
}

/**
 * Enough of OGS's socket for goban's play code: it listens for `game/<id>/move` and sends
 * `game/connect` when it starts, which nobody needs here.
 */
class StandInSocket {
  readonly connected = true;
  private listeners = new Map<string, Set<(data: unknown) => void>>();

  on(event: string, cb: (data: unknown) => void): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(cb);
  }

  off(event: string, cb: (data: unknown) => void): void {
    this.listeners.get(event)?.delete(cb);
  }

  send(_command: string, _data: unknown, cb?: () => void): void {
    cb?.();
  }

  receive(event: string, data: unknown): void {
    for (const cb of this.listeners.get(event) ?? []) cb(data);
  }
}

/** SGF points and goban's move encoding are the same letters; a pass is `..` to goban. */
function toGoban(move: Move): string {
  return move === 'pass' ? '..' : move;
}

function fromGoban(move: string): Move {
  return move === '..' || move === '' ? 'pass' : move;
}

function labels(on: boolean) {
  return { draw_top_labels: on, draw_left_labels: on, draw_bottom_labels: on, draw_right_labels: on };
}
