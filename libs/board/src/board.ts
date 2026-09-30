// LiGo's Go board: OGS goban's SVG renderer (npm `goban`, pinned, ADR 0014) behind a small
// chessground-like API, so lila's snabbdom views mount it in an `insert` hook and never touch goban.
// goban plays the moves; LiGo's code decides which ones count. When the player picks a move the
// board reports it (`onMove`) and waits: whoever owns the game (the server, or a local page) plays
// it back with `play`, or turns it down with `cancel`. Moves from the other side arrive by `play`
// too. goban's own play code expects OGS's socket; a stand-in socket carries `play` to it instead.
// Licence: MIT (LiGo's own code, ADR 0006). goban: Apache-2.0 (COPYING.md, NOTICE.md).

import { SVGRenderer, type GobanConfig, type GobanSelectedThemes, type MoveCommand } from 'goban';

import { HELP, describeText, playedText, pointName, pointText, refusedText } from './access';
import { gameConfig, refusalOf, stateOf, toXY, type BoardState, type Game } from './rules.mjs';
import { BOARD_THEMES, DEFAULT_THEME, STONE_THEMES, type Theme } from './themes';

export type { BoardState, Game };
export { BOARD_THEMES, DEFAULT_THEME, STONE_THEMES };
export type { BoardTheme, StoneTheme, Theme } from './themes';

export type Color = 'black' | 'white';
/** An SGF point such as `"dd"` (column, then row, from the top left), or `"pass"`. */
export type Move = string;
export type Refusal = 'occupied' | 'suicide' | 'superko';

/** A move that counted: who played it and how many stones it took (for sounds and announcements). */
export interface Played {
  move: Move;
  color: Color;
  /** Stones removed by this move; 0 for a pass. */
  captured: number;
}

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
  /** Board and stones (`DEFAULT_THEME` if left out; an unknown name falls back to Plain). */
  theme?: Theme;
  /** Letters and numbers round the board. Default on. */
  coordinates?: boolean;
  /** The player picked a move the rules allow. Answer with `play(move)` or `cancel()`. */
  onMove?: (move: Move) => void;
  /** goban refused the player's move before reporting it (a click on a stone is just ignored). */
  onRefused?: (reason: Refusal) => void;
  /** A move was played on the board by `play` (the player's or the opponent's); not previews. */
  onPlayed?: (played: Played) => void;
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
  /** Changes who may move, whether taps only preview, or the board's look. */
  set(options: Pick<BoardConfig, 'movable' | 'confirm' | 'theme'>): void;
  /** The position after the last move played (a preview doesn't count). */
  state(): BoardState;
  destroy(): void;
}

/**
 * goban's names for a theme. Anything not in the lists above becomes Plain, so a stored or mistyped
 * name can never make goban load a picture (its own default, Kaya, loads one from OGS's CDN).
 */
export function gobanThemes(theme: Theme = DEFAULT_THEME): GobanSelectedThemes {
  const board = (BOARD_THEMES as readonly string[]).includes(theme.board) ? theme.board : 'Plain';
  const stones = (STONE_THEMES as readonly string[]).includes(theme.stones) ? theme.stones : 'Plain';
  const [black, white] = stones === 'Slate & Shell' ? ['Slate', 'Shell'] : [stones, stones];
  return { board, black, white, 'removal-graphic': 'x', 'removal-scale': 1 };
}

const GAME_ID = 1;
let mounted = 0;
const IDS = { black: 1, white: 2 } as const;

/**
 * Mounts a board in `el`, as wide as `el` and resized with it (goban sizes the element it draws in,
 * so it draws in a child of `el`, and the page's CSS gives `el` its width).
 */
export function mountBoard(el: HTMLElement, config: BoardConfig): Board {
  // The frame holds goban's board and, over it, the keyboard cursor and the words a screen reader
  // reads out (unit 9.4, ADR 0026 §4).
  const frame = el.appendChild(document.createElement('div'));
  frame.style.position = 'relative';
  const boardDiv = frame.appendChild(document.createElement('div'));
  // goban draws the coordinates in a square-wide band on each side.
  const band = (config.coordinates ?? true) ? 1 : 0;
  const squares = config.size + 2 * band;
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
    reason => {
      say(refusedText(reason));
      config.onRefused?.(reason);
    },
    gobanThemes(config.theme),
  );
  goban.setMovable(config.movable ?? 'none');
  goban.on('update', () => config.onChange?.());
  goban.on('submit_move', () => config.onChange?.());

  const { say, placeCursor } = keyboardAndVoice(frame, boardDiv, goban, config.size, band, () => board);

  const resize = new ResizeObserver(() => {
    const size = squareSize();
    if (size !== goban.square_size) goban.setSquareSize(size);
    placeCursor();
  });
  resize.observe(el);

  const board: Board = {
    play: move => {
      if (destroyed) return;
      toXY(goban.engine, move); // throws on a malformed or off-board move, before anything changes
      goban.dropPreview();
      const before = goban.engine.last_official_move;
      const { toMove: color, captures } = goban.officialState();
      goban.handTurnOver();
      socket.receive(`game/${GAME_ID}/move`, {
        game_id: GAME_ID,
        move_number: goban.engine.getMoveNumber() + 1,
        move: toGoban(move),
      });
      // goban logs a move it can't place (an occupied point) and carries on: the turn stays.
      if (goban.engine.last_official_move === before) return goban.dropPreview();
      const captured = goban.officialState().captures[color] - captures[color];
      say(playedText(config.size, move, color, captured));
      config.onPlayed?.({ move, color, captured });
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
      if (options.theme) goban.useThemes(gobanThemes(options.theme));
    },
    state: () => goban.officialState(),
    destroy: () => {
      destroyed = true;
      resize.disconnect();
      goban.destroy();
      frame.remove();
    },
  };
  return board;
}

/**
 * Keyboard play and spoken updates (ADR 0026 §4): the board takes focus with Tab, arrow keys move a
 * cursor over the points, Enter or Space plays there (as a tap would, so Confirm moves previews
 * first), P passes and D describes the point. Moves, captures and refusals are read out through a
 * polite live region. goban has no keyboard support of its own; this drives its tap handling.
 */
function keyboardAndVoice(
  frame: HTMLElement,
  boardDiv: HTMLElement,
  goban: LigoGoban,
  size: number,
  band: number,
  board: () => Board,
) {
  const id = `ligo-board-${++mounted}`;
  const hidden = (div: HTMLElement) =>
    Object.assign(div.style, {
      position: 'absolute',
      width: '1px',
      height: '1px',
      overflow: 'hidden',
      clipPath: 'inset(50%)',
      whiteSpace: 'nowrap',
    });
  const help = frame.appendChild(document.createElement('div'));
  help.id = `${id}-help`;
  help.textContent = HELP;
  hidden(help);
  const live = frame.appendChild(document.createElement('div'));
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  hidden(live);

  boardDiv.tabIndex = 0;
  boardDiv.setAttribute('role', 'application');
  // Read as "9 by 9, Go board": the role description names what it is, the label its size.
  boardDiv.setAttribute('aria-roledescription', 'Go board');
  boardDiv.setAttribute('aria-label', `${size} by ${size}`);
  boardDiv.setAttribute('aria-describedby', help.id);

  // A black ring inside a white one: at least 3:1 against any board or stone colour.
  const ring = '0 0 0 2px #fff, 0 0 0 4px #000';
  const cursorDiv = frame.appendChild(document.createElement('div'));
  Object.assign(cursorDiv.style, {
    position: 'absolute',
    pointerEvents: 'none',
    borderRadius: '50%',
    boxShadow: `inset ${ring.replaceAll(', ', ', inset ')}`,
    display: 'none',
  });
  const half = Math.floor(size / 2);
  let [x, y] = [half, half];
  let shown = false;

  // The same words twice in a row are still read out: the text changes by a trailing space.
  let flip = false;
  const say = (text: string) => {
    flip = !flip;
    live.textContent = flip ? text : `${text}\u00a0`;
  };
  const placeCursor = () => {
    const sq = goban.square_size;
    Object.assign(cursorDiv.style, {
      left: `${(x + band) * sq}px`,
      top: `${(y + band) * sq}px`,
      width: `${sq}px`,
      height: `${sq}px`,
    });
  };
  const show = (on: boolean) => {
    shown = on;
    cursorDiv.style.display = on ? 'block' : 'none';
    boardDiv.style.boxShadow = on ? ring : '';
    if (on) placeCursor();
  };

  /** Why the player can't move now, or undefined when they can. */
  const cannotMove = () =>
    goban.pending() || goban.mayMove()
      ? undefined
      : goban.waiting()
        ? 'Waiting for the move to count'
        : 'Not your move';

  const playHere = () => {
    const name = pointName(size, x, y);
    const official = goban.officialState();
    const preview = goban.move_selected;
    if (goban.pending() && preview?.x === x && preview.y === y) return board().confirm();
    if (official.board[y][x] !== '.') return say(refusedText('occupied', name));
    const why = cannotMove();
    if (why) return say(why);
    goban.keyTap(x, y);
    if (goban.pending()) say(`${name} ready: Enter again to confirm, Escape to take back`);
  };

  const passHere = () => {
    const why = goban.pending() ? undefined : cannotMove();
    if (why) return say(why);
    board().pass();
  };

  // Keys the board acts on don't reach lila's page hotkeys (mousetrap listens on the document):
  // on a game page an arrow must move the cursor, not step through the moves as well.
  const ours = new Set([
    'ArrowLeft',
    'ArrowRight',
    'ArrowUp',
    'ArrowDown',
    'Home',
    'End',
    'PageUp',
    'PageDown',
  ]);
  for (const k of ['Enter', ' ', 'p', 'P', 'd', 'D']) ours.add(k);
  const plain = (e: KeyboardEvent) => !e.ctrlKey && !e.altKey && !e.metaKey;
  boardDiv.addEventListener('keypress', e => {
    if (plain(e) && ours.has(e.key)) e.stopPropagation();
  });
  boardDiv.addEventListener('keyup', e => {
    if (plain(e) && ours.has(e.key)) e.stopPropagation();
  });

  // A click never focuses the board (goban handles the pointer itself); Tab does, and then the
  // cursor shows and says where it is.
  boardDiv.addEventListener('focus', () => {
    show(boardDiv.matches(':focus-visible'));
    if (shown) say(pointText(goban.officialState().board, x, y));
  });
  boardDiv.addEventListener('blur', () => show(false));
  boardDiv.addEventListener('pointerdown', () => show(false));
  boardDiv.addEventListener('keydown', e => {
    // Escape takes back a waiting preview; otherwise it belongs to the page (closing a dialog).
    if (plain(e) && e.key === 'Escape' && goban.pending()) {
      e.preventDefault();
      e.stopPropagation();
      board().cancel();
      return say('Taken back');
    }
    if (!plain(e) || !ours.has(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    // A held key repeats: moving on is fine, playing or passing twice is not (Confirm moves would
    // preview and play from one press).
    if (e.repeat && !e.key.startsWith('Arrow') && !['Home', 'End', 'PageUp', 'PageDown'].includes(e.key))
      return;
    const [x0, y0] = [x, y];
    const last = size - 1;
    switch (e.key) {
      case 'ArrowLeft':
        x = Math.max(0, x - 1);
        break;
      case 'ArrowRight':
        x = Math.min(last, x + 1);
        break;
      case 'ArrowUp':
        y = Math.max(0, y - 1);
        break;
      case 'ArrowDown':
        y = Math.min(last, y + 1);
        break;
      case 'Home':
        x = 0;
        break;
      case 'End':
        x = last;
        break;
      case 'PageUp':
        y = 0;
        break;
      case 'PageDown':
        y = last;
        break;
      case 'Enter':
      case ' ':
        playHere();
        break;
      case 'p':
      case 'P':
        passHere();
        break;
      case 'd':
      case 'D':
        say(describeText(goban.officialState().board, x, y));
        break;
    }
    if (!shown) show(true);
    if (x !== x0 || y !== y0) {
      placeCursor();
      say(pointText(goban.officialState().board, x, y));
    }
  });

  return { say, placeCursor };
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
    private selected: GobanSelectedThemes,
  ) {
    LigoGoban.constructing = selected;
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

  /** goban asks for the themes inside its constructor, before `selected` is set. */
  private static constructing: GobanSelectedThemes;

  protected override getSelectedThemes(): GobanSelectedThemes {
    return this.selected ?? LigoGoban.constructing;
  }

  useThemes(themes: GobanSelectedThemes): void {
    this.selected = themes;
    this.setTheme(themes, false);
  }

  /** A tap on a point, from the keyboard: goban's own tap handling, previews and all. */
  keyTap(x: number, y: number): void {
    this.tapAt(x, y, false);
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

  /** A move was reported and the page hasn't answered it yet. */
  waiting(): boolean {
    return this.awaiting;
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
