import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  boardGame,
  eventMove,
  goStatusText,
  moveName,
  playedMoves,
  resolveConfirm,
  resultText,
  soundOf,
  stepsOf,
} from '../src/go';
import type { GoData, RoundData } from '../src/interfaces';
import { movesUntil, upgradeServerData } from '../src/util';

const go = (o: Partial<GoData> = {}): GoData => ({
  size: 9,
  rules: 'japanese',
  komi: 6.5,
  moves: '',
  prisoners: { b: 0, w: 0 },
  phase: 'play',
  ...o,
});

const status = (name: any) => ({ id: 0 as any, name });

describe('moveName', () => {
  test('names points as the board prints them: letters without I, rows from the bottom', () => {
    assert.equal(moveName(9, 'ee'), 'E5');
    assert.equal(moveName(9, 'aa'), 'A9');
    assert.equal(moveName(9, 'ii'), 'J1');
    assert.equal(moveName(19, 'pd'), 'Q16');
    assert.equal(moveName(19, 'dp'), 'D4');
  });
  test('a pass is "Pass"', () => assert.equal(moveName(19, 'pass'), 'Pass'));
});

describe('playedMoves and stepsOf', () => {
  test('reads the space-separated moves, without resumes (not a ply, ADR 0019 §3)', () => {
    assert.deepEqual(playedMoves(go()), []);
    assert.deepEqual(playedMoves(go({ moves: 'ee pass cc resume dd' })), ['ee', 'pass', 'cc', 'dd']);
  });

  test('an even game starts at ply 1 (Black to move) and numbers each move from there', () => {
    const steps = stepsOf(go({ moves: 'ee cc pass' }), 1);
    assert.deepEqual(steps, [
      { ply: 1, uci: '', san: '' },
      { ply: 2, uci: 'ee', san: 'E5' },
      { ply: 3, uci: 'cc', san: 'C7' },
      { ply: 4, uci: 'pass', san: 'Pass' },
    ]);
  });

  test('a handicap game starts at ply 0 (White to move)', () => {
    assert.deepEqual(
      stepsOf(go({ moves: 'ee' }), 0).map(s => s.ply),
      [0, 1],
    );
  });

  test('the move event carries a stone as `p` and a pass as `pass`', () => {
    const base = {
      ply: 2,
      cap: [],
      prisoners: { b: 0, w: 0 },
      phase: 'play' as const,
      board: '9/9/9/9/9/9/9/9/9',
    };
    assert.equal(eventMove({ ...base, p: 'ee' }), 'ee');
    assert.equal(eventMove({ ...base, pass: true }), 'pass');
  });
});

describe('boardGame', () => {
  test('an even game: empty board, Black to move, the game komi and rules', () => {
    assert.deepEqual(boardGame(go({ rules: 'chinese', komi: 7.5 })), {
      size: 9,
      ruleset: 'chinese',
      komi: 7.5,
      handicap: 0,
      stones: { black: [], white: [] },
      toMove: 'black',
    });
  });

  test("a handicap game: the spec's fixed stones (R-HCP-4) and White to move", () => {
    const g = boardGame(go({ handicap: 2, komi: 0.5 }));
    assert.deepEqual(g.stones, { black: ['gc', 'cg'], white: [] });
    assert.equal(g.toMove, 'white');
    assert.equal(g.handicap, 2);
  });

  test('a custom position wins over the handicap table', () => {
    const g = boardGame(go({ handicap: 2, position: { black: ['aa'], white: ['bb'], toMove: 'black' } }));
    assert.deepEqual(g.stones, { black: ['aa'], white: ['bb'] });
    assert.equal(g.toMove, 'black');
  });
});

describe('the result', () => {
  test("in Go's short form", () => {
    assert.equal(resultText(status('resign'), 'black'), 'B+R');
    assert.equal(resultText(status('outoftime'), 'white'), 'W+T');
    assert.equal(resultText(status('timeout'), 'white'), 'W+F');
    assert.equal(resultText(status('noStart'), 'black'), 'B+F');
  });

  test('a counted game: the margin, or Jigo for an even count (ADR 0020 §5)', () => {
    assert.equal(resultText(status('variantEnd'), 'black', 'B+3.5'), 'B+3.5');
    assert.equal(resultText(status('variantEnd'), 'white', 'W+0.5'), 'W+0.5');
    assert.equal(resultText(status('variantEnd'), undefined, '0'), 'Jigo');
  });

  test('a game that ended with no count has no result', () => {
    assert.equal(String(resultText(status('unknownFinish'), undefined)), 'site.goNoResult');
  });

  test('nothing while playing or after an abort', () => {
    assert.equal(resultText(status('started'), undefined), undefined);
    assert.equal(resultText(status('aborted'), undefined), undefined);
  });

  test('says how a counted game, or one with no result, ended', () => {
    const ended = (name: string, winner?: Color, result?: string) =>
      ({ game: { status: status(name), winner, result } }) as RoundData;
    // (the test stub drops the colour's name, a function, from the arguments it prints)
    assert.equal(goStatusText(ended('variantEnd', 'white', 'W+12')), 'site.goXWinsByNbPoints(12, )');
    assert.equal(String(goStatusText(ended('variantEnd', undefined, '0'))), 'site.goJigo');
    assert.equal(String(goStatusText(ended('unknownFinish'))), 'site.goScoreNotCounted');
    assert.equal(goStatusText(ended('resign', 'black')), undefined);
  });
});

describe('preferences and sounds', () => {
  test('Confirm moves: never, on touch screens (the default), always (unit 2.3)', () => {
    assert.equal(resolveConfirm(0, true), false);
    assert.equal(resolveConfirm(1, true), true);
    assert.equal(resolveConfirm(1, false), false);
    assert.equal(resolveConfirm(undefined, true), true);
    assert.equal(resolveConfirm(2, false), true);
  });

  test("a stone, a capture and a pass play lila's move, capture and confirmation sounds", () => {
    assert.equal(soundOf('ee', 0), 'move');
    assert.equal(soundOf('ee', 2), 'capture');
    assert.equal(soundOf('pass', 0), 'confirmation');
  });
});

describe('upgradeServerData', () => {
  test("builds the move list from the Go moves, not the server's chess steps", () => {
    const d = {
      game: { go: go({ moves: 'ee cc' }), startedAtTurn: 1 },
      pref: {},
      steps: [{ ply: 0, fen: 'rnbqkbnr/…', san: '', uci: '' }],
    } as unknown as RoundData;
    upgradeServerData(d);
    assert.deepEqual(
      d.steps.map(s => [s.ply, s.uci]),
      [
        [1, ''],
        [2, 'ee'],
        [3, 'cc'],
      ],
    );
    assert.deepEqual(movesUntil(d, 1), []);
    assert.deepEqual(movesUntil(d, 2), ['ee']);
    assert.deepEqual(movesUntil(d, 3), ['ee', 'cc']);
  });
});
