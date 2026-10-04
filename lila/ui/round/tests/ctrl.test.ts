import type { Board, BoardConfig, ScoringMarks } from '@ligo/board/board';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { pubsub } from 'lib/pubsub';

import RoundController from '../src/ctrl';
import type { GoMoveEvent, RoundData, RoundOpts, ScoringData } from '../src/interfaces';

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
  scoring: ScoringMarks | undefined;
  destroyed = false;
  readonly config: BoardConfig;
  constructor(config: BoardConfig) {
    this.config = config;
    this.movable = config.movable;
    this.scoring = config.scoring;
  }
  play = (move: string) => void this.played.push(move);
  cancel = () => {};
  // Like goban's board: a pass is reported only by a board that takes the player's moves.
  pass = () => void (this.movable !== 'none' && this.config.onMove?.('pass'));
  pending = () => false;
  confirm = () => {};
  set = (o: Pick<BoardConfig, 'movable' | 'confirm' | 'theme' | 'scoring'>) => {
    if (o.movable) this.movable = o.movable;
    if ('scoring' in o) this.scoring = o.scoring;
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

  test('a game the scoring service never counted ends with no result, said in words', () => {
    const { ctrl } = round(data('ee pass pass'));
    ctrl.endWithData({ status: { id: 38, name: 'unknownFinish' }, boosted: false });
    assert.equal(String(ctrl.statusText()), 'site.goScoreNotCounted');
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

  test("draws the board in the page's board and stone preferences, and follows the account menu", () => {
    try {
      document.body.dataset.board = 'Book';
      document.body.dataset.pieceSet = 'Slate & Shell';
      const { ctrl, boards } = round(data('ee'));
      assert.deepEqual(boards[0].config.theme, { board: 'Book', stones: 'Slate & Shell' });
      // The account menu changes the page's preferences, then says so.
      document.body.dataset.board = 'brown'; // a chess board saved before LiGo: not offered
      document.body.dataset.pieceSet = 'Night';
      pubsub.emit('board.change', false);
      assert.deepEqual(ctrl.theme, { board: 'Plain', stones: 'Night' });
      assert.notEqual(boards.at(-1), boards[0], 'a fresh board');
      assert.deepEqual(boards.at(-1)!.config.theme, { board: 'Plain', stones: 'Night' });
    } finally {
      delete document.body.dataset.board;
      delete document.body.dataset.pieceSet;
    }
  });
});

// The scoring phase (unit 4.10, ADR 0020 §3, §6).
const proposal = (o: Partial<ScoringData> = {}): ScoringData => ({
  phase: 1,
  v: '1:1',
  expiresIn: 180,
  src: 'katago',
  dead: ['cc'],
  seal: [],
  owner: '',
  score: {
    b: { territory: 10, stones: 0, prisoners: 1, total: 11 },
    w: { territory: 3, stones: 0, prisoners: 0, komi: 6.5, compensation: 0, total: 9.5 },
  },
  accepted: { b: false, w: false },
  pending: false,
  ...o,
});

describe('the scoring phase', () => {
  beforeEach(() => {
    sent.length = 0;
  });
  // The countdown redraws every second while the phase lasts: end each game so the test run can stop.
  afterEach(() =>
    made.splice(0).forEach(c => {
      c.transientMove.clear();
      c.endWithData({ status: { id: 31, name: 'resign' }, winner: 'black', boosted: false });
    }),
  );

  /** Black to answer the proposal of a game that ended its play on White's pass. */
  const scoring = (o: { spectator?: boolean } = {}) => {
    const r = round(data('ee cc pass', o));
    r.ctrl.apiMove(moveEvent(5, { pass: true, phase: 'scoring' }));
    return r;
  };

  test('the second pass stops play; "Counting…" shows no marks and takes no taps', () => {
    const { ctrl, boards } = scoring();
    assert.equal(boards[0].movable, 'none');
    assert.ok(ctrl.inScoring());
    assert.equal(ctrl.canMove(), false);
    ctrl.apiScoring({ phase: 1, expiresIn: 600, counting: true });
    assert.equal(ctrl.scoringCount(), undefined);
    assert.equal(boards[0].scoring, undefined);
  });

  test('the proposal is drawn; a tapped chain goes to the server with the count version, once', () => {
    const { ctrl, boards } = scoring();
    ctrl.apiScoring(proposal());
    assert.deepEqual(boards[0].scoring, { dead: ['cc'], owner: '', seal: [], tappable: true });
    assert.equal(boards[0].movable, 'none');
    assert.equal(ctrl.scoringSecondsLeft(), 180);
    boards[0].config.onScoreTap!('ee');
    boards[0].config.onScoreTap!('cc');
    assert.deepEqual(sent, [['score-toggle', { p: 'ee', v: '1:1' }]]);
    assert.equal(boards[0].scoring.tappable, false, 'no second tap until the recount');
    ctrl.apiScoring(proposal({ v: '1:2', dead: [], pending: false }));
    assert.equal(boards[0].scoring.tappable, true);
    assert.deepEqual(boards[0].scoring.dead, []);
  });

  test('a recount on its way takes no taps and no accept', () => {
    const { ctrl, boards } = scoring();
    ctrl.apiScoring(proposal({ pending: true }));
    assert.equal(boards[0].scoring!.tappable, false);
    ctrl.acceptScore();
    assert.deepEqual(sent, []);
  });

  test('Accept sends the version on show once; the opponent sees who accepted', () => {
    const { ctrl } = scoring();
    ctrl.apiScoring(proposal());
    ctrl.acceptScore();
    assert.deepEqual(sent, [['score-accept', { v: '1:1' }]]);
    ctrl.apiScoring(proposal({ accepted: { b: true, w: false } }));
    assert.ok(ctrl.hasAccepted());
    ctrl.acceptScore();
    assert.equal(sent.length, 1);
  });

  test("a spectator sees the marks and can't tap, accept or resume", () => {
    const { ctrl, boards } = scoring({ spectator: true });
    ctrl.apiScoring(proposal());
    assert.equal(boards[0].scoring!.tappable, false);
    ctrl.acceptScore();
    ctrl.resumePlay();
    assert.deepEqual(sent, []);
  });

  test('Resume asks the server; its resume event clears the marks and gives the turn back', () => {
    const { ctrl, boards } = scoring();
    ctrl.apiScoring(proposal());
    ctrl.resumePlay();
    assert.deepEqual(sent, [['score-resume', undefined]]);
    ctrl.apiResume({ ply: 5, turn: 'black', phase: 'play', board: '' });
    assert.equal(ctrl.inScoring(), false);
    assert.equal(ctrl.data.game.scoring, undefined);
    assert.equal(boards[0].scoring, undefined);
    assert.equal(boards[0].movable, 'black');
    assert.equal(ctrl.data.game.go.moves, 'ee cc pass pass resume');
    assert.equal(ctrl.data.steps.length, 5, 'a resume is not a move in the list');
    assert.ok(ctrl.canMove());
  });

  test("the socket's scoring and resume events reach the controller", () => {
    const { ctrl, boards } = scoring();
    assert.ok(ctrl.socket.receive('scoring', proposal()));
    assert.equal(boards[0].scoring?.tappable, true);
    assert.ok(ctrl.socket.receive('resume', { ply: 5, turn: 'black', phase: 'play', board: '' }));
    assert.equal(ctrl.inScoring(), false);
  });

  test('a resume event out of step with the moves fetches the game again', () => {
    const { ctrl } = scoring();
    let reloaded = false;
    ctrl.socket.reload = () => void (reloaded = true);
    ctrl.apiResume({ ply: 9, turn: 'black', phase: 'play', board: '' });
    assert.ok(reloaded);
    assert.ok(ctrl.inScoring());
  });

  test('a game ended by counting keeps its marks and names the margin', () => {
    const { ctrl, boards } = scoring();
    ctrl.apiScoring(proposal({ accepted: { b: true, w: true } }));
    ctrl.endWithData({
      status: { id: 60, name: 'variantEnd' },
      winner: 'black',
      boosted: false,
      result: 'B+1.5',
    });
    assert.deepEqual(boards[0].scoring, { dead: ['cc'], owner: '', seal: [], tappable: false });
    assert.match(String(ctrl.statusText()), /^site\.goXWinsByNbPoints\(1\.5/);
    assert.equal(ctrl.data.game.result, 'B+1.5');
  });

  test('resigning during the scoring phase takes the marks away', () => {
    const { ctrl, boards } = scoring();
    ctrl.apiScoring(proposal());
    ctrl.endWithData({ status: { id: 31, name: 'resign' }, winner: 'white', boosted: false });
    assert.equal(boards[0].scoring, undefined);
  });

  test('a game loaded in its scoring phase shows the marks at once', () => {
    const d = data('ee cc pass pass');
    d.game.go.phase = 'scoring';
    d.game.scoring = proposal();
    const { ctrl, boards } = round(d);
    assert.equal(boards[0].config.scoring?.tappable, true);
    assert.equal(boards[0].config.movable, 'none');
    ctrl.userJump(3);
    assert.equal(boards.at(-1)!.config.scoring, undefined, 'an earlier position has no marks');
  });
});
