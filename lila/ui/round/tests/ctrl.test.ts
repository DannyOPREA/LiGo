import type { Board, BoardConfig } from '@ligo/board/board';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import RoundController from '../src/ctrl';
import type { GoMoveEvent, RoundData, RoundOpts } from '../src/interfaces';

// What the page needs from lila's globals, recorded so tests can check them.
const played: string[] = [];
const chainable: any = new Proxy(() => chainable, { get: () => chainable });
Object.assign(globalThis.site, {
  sound: { play: (name: string) => played.push(name), say: () => false },
  mousetrap: chainable,
  unload: { expected: false },
  powertip: {},
  quietMode: false,
});
(globalThis as any).$ = chainable;
(globalThis as any).location = window.location;
(globalThis as any).Event = window.Event;
// The title's "your turn" ticker swaps the favicon.
document.head.appendChild(Object.assign(document.createElement('link'), { id: 'favicon' }));

/** A stand-in for libs/board's board: records what the round asks of it. */
class FakeBoard implements Board {
  played: string[] = [];
  movable: BoardConfig['movable'];
  destroyed = false;
  constructor(readonly config: BoardConfig) {
    this.movable = config.movable;
  }
  play = (move: string) => void this.played.push(move);
  cancel = () => {};
  // Like goban's board: a pass is reported only by a board that takes the player's moves.
  pass = () => void (this.movable !== 'none' && this.config.onMove?.('pass'));
  pending = () => false;
  confirm = () => {};
  set = (o: Pick<BoardConfig, 'movable' | 'confirm' | 'theme'>) => {
    if (o.movable) this.movable = o.movable;
  };
  state = () => ({ board: [], toMove: 'black' as const, captures: { black: 0, white: 0 }, koPoint: null });
  destroy = () => void (this.destroyed = true);
}

const player = (color: Color) => ({ color, id: color[0], version: 0, onGame: true, isGone: false }) as any;

function data(moves: string, o: { spectator?: boolean; color?: Color; handicap?: number } = {}): RoundData {
  const n = moves ? moves.split(' ').length : 0;
  const color = o.color ?? 'black';
  const other = color === 'black' ? 'white' : 'black';
  // ADR 0019: Black's first move is ply 1; a handicap game starts at ply 0 with White to move.
  const first = o.handicap ? 0 : 1;
  return {
    game: {
      id: 'abcdefgh',
      status: { id: 20, name: 'started' },
      player: (first + n) % 2 === 0 ? 'white' : 'black',
      turns: first + n,
      startedAtTurn: first,
      source: 'lobby',
      speed: 'blitz',
      variant: { key: 'standard', name: 'Standard', short: 'Std' },
      perf: 'blitz',
      fen: '',
      go: {
        size: 9,
        rules: 'japanese',
        komi: o.handicap ? 0.5 : 6.5,
        moves,
        prisoners: { b: 0, w: 0 },
        phase: 'play',
        ...(o.handicap ? { handicap: o.handicap } : {}),
      },
    },
    player: { ...player(color), spectator: o.spectator },
    opponent: player(other),
    pref: { coords: 1, replay: 2, confirmMoves: 0 },
    steps: [],
    takebackable: true,
    moretimeable: true,
  } as unknown as RoundData;
}

const sent: Array<[string, unknown]> = [];
const made: RoundController[] = [];
function round(d: RoundData): { ctrl: RoundController; boards: FakeBoard[] } {
  const boards: FakeBoard[] = [];
  const opts: RoundOpts = {
    data: d,
    socketSend: (t: string, payload: unknown) => sent.push([t, payload]),
    onChange: () => {},
  };
  const ctrl = new RoundController(opts, () => {});
  made.push(ctrl);
  // The board as the view would mount it, with a stand-in for goban.
  (ctrl.board as any).mountBoard = (_: HTMLElement, config: BoardConfig) => {
    const b = new FakeBoard(config);
    boards.push(b);
    return b;
  };
  ctrl.board.attach(document.createElement('div'));
  return { ctrl, boards };
}

const moveEvent = (ply: number, o: Partial<GoMoveEvent> = {}): GoMoveEvent => ({
  ply,
  cap: [],
  prisoners: { b: 0, w: 0 },
  phase: 'play',
  board: '',
  ...o,
});

describe('RoundController on a Go game', () => {
  beforeEach(() => {
    played.length = 0;
    sent.length = 0;
  });
  // A sent move with no answer from the server reloads the game after 10 s (TransientMove): no server here.
  afterEach(() => made.splice(0).forEach(c => c.transientMove.clear()));

  test('shows every move played, lets the player move, and names the last move', () => {
    const { ctrl, boards } = round(data('ee cc'));
    assert.equal(ctrl.ply, 3);
    assert.deepEqual(boards[0].config.moves, ['ee', 'cc']);
    assert.equal(boards[0].config.movable, 'black');
    assert.equal(boards[0].config.komi, 6.5);
    assert.equal(ctrl.stepAt(3).san, 'C7');
  });

  test("a spectator's board takes no moves", () => {
    const { boards } = round(data('ee', { spectator: true }));
    assert.equal(boards[0].config.movable, 'none');
  });

  test('a stone the board reports goes to the server as an SGF point, a pass as "pass"', () => {
    const { boards } = round(data(''));
    boards[0].config.onMove!('ee');
    assert.deepEqual([sent.at(-1)![0], (sent.at(-1)![1] as any).u], ['move', 'ee']);
    round(data('')).ctrl.pass();
    assert.deepEqual([sent.at(-1)![0], (sent.at(-1)![1] as any).u], ['move', 'pass']);
  });

  test("the server's move event plays the move on the board and adds it to the list", () => {
    const { ctrl, boards } = round(data('ee'));
    ctrl.apiMove(moveEvent(3, { p: 'cc', prisoners: { b: 0, w: 1 } }));
    assert.deepEqual(boards[0].played, ['cc']);
    assert.equal(ctrl.ply, 3);
    assert.equal(ctrl.data.game.go.moves, 'ee cc');
    assert.deepEqual(ctrl.data.game.go.prisoners, { b: 0, w: 1 });
    assert.equal(ctrl.data.game.player, 'black');
    assert.equal(ctrl.data.steps.at(-1)!.san, 'C7');
    assert.equal(boards[0].movable, 'black');
  });

  test('looking back mounts the board with fewer moves and no moving; a new move waits', () => {
    const { ctrl, boards } = round(data('ee cc gg'));
    ctrl.userJump(2);
    const back = boards.at(-1)!;
    assert.ok(boards[0].destroyed);
    assert.deepEqual(back.config.moves, ['ee']);
    assert.equal(back.config.movable, 'none');
    ctrl.apiMove(moveEvent(5, { pass: true }));
    assert.deepEqual(back.played, [], 'the move is listed, not played on the earlier position');
    assert.equal(ctrl.ply, 2);
    assert.ok(ctrl.isLate());
    ctrl.userJump(5);
    assert.deepEqual(boards.at(-1)!.config.moves, ['ee', 'cc', 'gg', 'pass']);
    assert.equal(boards.at(-1)!.config.movable, 'black', "the player's colour: goban knows whose turn it is");
  });

  test('a stone played while looking back is taken back, not sent', () => {
    const { ctrl, boards } = round(data('ee cc'));
    ctrl.userJump(2);
    boards.at(-1)!.config.onMove!('gg');
    assert.equal(sent.length, 0);
  });

  test('the end of the game stops the board and names the result', () => {
    const { ctrl, boards } = round(data('ee cc'));
    ctrl.endWithData({ status: { id: 31, name: 'resign' }, winner: 'black', boosted: false });
    assert.equal(boards.at(-1)!.movable, 'none');
    assert.match(ctrl.statusText(), /resign/i);
  });

  test('two passes end a Phase 3 game with no winner, said in words', () => {
    const { ctrl } = round(data('ee pass pass'));
    ctrl.endWithData({ status: { id: 38, name: 'unknownFinish' }, boosted: false });
    assert.match(ctrl.statusText(), /Both players passed/);
  });

  test('the Pass button does nothing when it is not your turn', () => {
    const { ctrl } = round(data('ee'));
    ctrl.pass();
    assert.equal(sent.length, 0);
  });
  test('a sent move blocks a second one until the server plays it, even after looking back', () => {
    const { ctrl, boards } = round(data('ee cc'));
    boards[0].config.onMove!('gg');
    assert.equal(ctrl.canMove(), false, 'Pass is off while the stone is on its way');
    ctrl.userJump(2);
    ctrl.userJump(3);
    const now = boards.at(-1)!;
    assert.notEqual(now, boards[0]);
    assert.equal(now.config.movable, 'none');
    now.config.onMove!('aa');
    now.pass();
    assert.deepEqual(
      sent.map(([, m]) => (m as any).u),
      ['gg'],
    );
    ctrl.apiMove(moveEvent(4, { p: 'gg' }));
    assert.deepEqual(now.played, ['gg']);
    assert.equal(now.movable, 'black', 'the board takes moves again');
    assert.ok(!ctrl.canMove(), "White's turn now");
    ctrl.apiMove(moveEvent(5, { p: 'aa' }));
    assert.ok(ctrl.canMove());
  });

  test('a game that ends before a sent stone arrives drops that stone from the board', () => {
    const { ctrl, boards } = round(data('ee cc'));
    boards[0].config.onMove!('gg');
    ctrl.endWithData({ status: { id: 35, name: 'outoftime' }, winner: 'white', boosted: false });
    const now = boards.at(-1)!;
    assert.notEqual(now, boards[0], 'a fresh board');
    assert.deepEqual(now.config.moves, ['ee', 'cc']);
    assert.equal(now.config.movable, 'none');
  });

  test('a missed move event fetches the game again rather than listing the move out of place', () => {
    const { ctrl } = round(data('ee'));
    let reloads = 0;
    ctrl.socket.reload = () => void reloads++;
    ctrl.apiMove(moveEvent(4, { p: 'cc' }));
    assert.equal(reloads, 1);
    assert.equal(ctrl.data.steps.length, 2, 'nothing listed');
  });

  test('a handicap game starts at ply 0 with the stones placed and White to move', () => {
    const { ctrl, boards } = round(data('', { handicap: 2, color: 'white' }));
    assert.equal(ctrl.ply, 0);
    assert.equal(boards[0].config.toMove, 'white');
    assert.equal(boards[0].config.handicap, 2);
    assert.equal(boards[0].config.movable, 'white');
    boards[0].config.onMove!('ee');
    ctrl.apiMove(moveEvent(1, { p: 'ee' }));
    assert.equal(ctrl.data.game.player, 'black');
    assert.equal(ctrl.stepAt(1).san, 'E5');
    assert.equal(boards[0].movable, 'white', 'goban knows it is now Black to move');
  });
});
