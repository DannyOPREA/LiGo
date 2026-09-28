import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { isTouchDevice } from 'lib/device';

import PlaygroundCtrl from '../src/ctrl';

const noop = () => {};

describe('PlaygroundCtrl', () => {
  test('starts even, Japanese, 9x9, with Japanese even komi', () => {
    const ctrl = new PlaygroundCtrl({}, noop);
    assert.deepEqual(ctrl.settings, { size: 9, ruleset: 'japanese', handicap: 0, komi: 6.5 });
    assert.deepEqual(ctrl.pending, ctrl.settings);
    assert.deepEqual(ctrl.moves, []);
  });

  test('boardConfig places no stones and Black to move in an even game', () => {
    const ctrl = new PlaygroundCtrl({}, noop);
    const config = ctrl.boardConfig();
    assert.deepEqual(config.stones, { black: [], white: [] });
    assert.equal(config.toMove, 'black');
  });

  test('boardConfig places R-HCP-4 stones and White to move in a handicap game', () => {
    const ctrl = new PlaygroundCtrl({}, noop);
    ctrl.setPendingSize(9);
    ctrl.setPendingHandicap(2);
    ctrl.newGame();
    const config = ctrl.boardConfig();
    assert.deepEqual(config.stones, { black: ['gc', 'cg'], white: [] });
    assert.equal(config.toMove, 'white');
    assert.equal(config.handicap, 2);
    assert.equal(config.komi, 0.5); // R-KOMI-2
  });

  test('changing ruleset or handicap resets pending komi to the spec default (R-KOMI-1/2)', () => {
    const ctrl = new PlaygroundCtrl({}, noop);
    ctrl.setPendingRuleset('chinese');
    assert.equal(ctrl.pending.komi, 7.5);
    ctrl.setPendingHandicap(3);
    assert.equal(ctrl.pending.komi, 0.5);
    ctrl.setPendingKomi(4);
    assert.equal(ctrl.pending.komi, 4); // an explicit komi is kept until the next ruleset/handicap change
  });

  test('picking 13x13 drops any pending handicap (no R-HCP-4 table yet)', () => {
    const ctrl = new PlaygroundCtrl({}, noop);
    ctrl.setPendingHandicap(4);
    ctrl.setPendingSize(13);
    assert.equal(ctrl.pending.handicap, 0);
    assert.equal(ctrl.pending.komi, 6.5);
  });

  test('newGame applies the pending settings, clears the moves and bumps the generation', () => {
    const ctrl = new PlaygroundCtrl({}, noop);
    ctrl.moves.push('dd', 'pass');
    const before = ctrl.generation;
    ctrl.setPendingSize(19);
    ctrl.newGame();
    assert.equal(ctrl.settings.size, 19);
    assert.deepEqual(ctrl.moves, []);
    assert.equal(ctrl.generation, before + 1);
  });

  test('undo drops the last move and bumps the generation; does nothing with no moves', () => {
    const ctrl = new PlaygroundCtrl({}, noop);
    const before = ctrl.generation;
    ctrl.undo();
    assert.equal(ctrl.generation, before);
    ctrl.moves.push('dd', 'pass');
    ctrl.undo();
    assert.deepEqual(ctrl.moves, ['dd']);
    assert.equal(ctrl.generation, before + 1);
  });

  test('bothPassed is true only right after two consecutive passes', () => {
    const ctrl = new PlaygroundCtrl({}, noop);
    assert.equal(ctrl.bothPassed, false);
    ctrl.moves.push('pass');
    assert.equal(ctrl.bothPassed, false);
    ctrl.moves.push('pass');
    assert.equal(ctrl.bothPassed, true);
    ctrl.moves.push('dd');
    assert.equal(ctrl.bothPassed, false);
  });
  test('one stone of handicap places no stone: Black first, komi 0.5 (R-HCP-2)', () => {
    const ctrl = new PlaygroundCtrl({}, noop);
    ctrl.setPendingHandicap(1);
    ctrl.newGame();
    const config = ctrl.boardConfig();
    assert.deepEqual(config.stones, { black: [], white: [] });
    assert.equal(config.toMove, 'black');
    assert.equal(config.komi, 0.5);
  });

  test('a komi that is blank, not a half point or beyond the board (R-KOMI-4) is ignored', () => {
    const ctrl = new PlaygroundCtrl({}, noop);
    ctrl.setPendingKomi(Number(''.trim() || NaN));
    ctrl.setPendingKomi(6.3);
    ctrl.setPendingKomi(-82); // 9x9 has 81 points
    assert.equal(ctrl.pending.komi, 6.5);
    ctrl.setPendingKomi(-81);
    assert.equal(ctrl.pending.komi, -81);
    ctrl.setPendingKomi(0);
    assert.equal(ctrl.pending.komi, 0);
  });

  test('the moves passed in are copied, not played into', () => {
    const moves = ['ee'];
    const ctrl = new PlaygroundCtrl({ moves }, noop);
    assert.notEqual(ctrl.moves, moves);
    assert.deepEqual(ctrl.moves, ['ee']);
  });

  // Pref.ConfirmMoves (unit 2.3): 0 never, 1 on touch screens (the pref's default), 2 always.
  describe('confirm (Pref.ConfirmMoves)', () => {
    test('never (0) is never confirm, whatever the device', () => {
      assert.equal(new PlaygroundCtrl({ confirmMoves: 0 }, noop).confirm, false);
    });

    test('always (2) is always confirm, whatever the device', () => {
      assert.equal(new PlaygroundCtrl({ confirmMoves: 2 }, noop).confirm, true);
    });

    test('on touch screens (1) follows the device (lib/device.isTouchDevice)', () => {
      assert.equal(new PlaygroundCtrl({ confirmMoves: 1 }, noop).confirm, isTouchDevice());
    });

    test('an anonymous visitor (no confirmMoves passed) gets the pref default: on touch screens', () => {
      assert.equal(new PlaygroundCtrl({}, noop).confirm, isTouchDevice());
    });
  });
});
