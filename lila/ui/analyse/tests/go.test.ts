import { playFrom, readTree, writeTree } from '@ligo/board/sgf';
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { makeTree, treeOps } from 'lib/tree';

import {
  boardMove,
  boardSetup,
  capturedBy,
  nodeFullName,
  pointName,
  positionSgf,
  settingsText,
  soundOf,
  treeMove,
} from '../src/go';
import type { AnalyseNode, Line } from '../src/interfaces';

describe('point names', () => {
  test('columns skip I and rows count from the bottom', () => {
    assert.equal(pointName(19, 'aa'), 'A19');
    assert.equal(pointName(19, 'hs'), 'H1');
    assert.equal(pointName(19, 'is'), 'J1');
    assert.equal(pointName(19, 'ss'), 'T1');
    assert.equal(pointName(9, 'ee'), 'E5');
  });

  test('a pass is named Pass, however it is written', () => {
    // The tests' i18n stand-in names a key instead of its English text.
    assert.equal(String(pointName(19, '..')), 'site.goPass');
    assert.equal(String(pointName(19, 'pass')), 'site.goPass');
    assert.equal(String(pointName(19, '')), 'site.goPass');
  });

  test("the move list's menu names a move with its number and colour, and the root Start", () => {
    const root = readTree('(;GM[1]FF[4]SZ[19];B[dd];W[])');
    const [black, white] = treeOps.mainlineNodeList(root).slice(1);
    assert.equal(String(nodeFullName(19, root)), 'site.goStart');
    assert.equal(nodeFullName(19, black), '1. site.black D16');
    assert.equal(nodeFullName(19, white), '2. site.white site.goPass');
  });
});

describe("the tree's moves and libs/board's", () => {
  test('a pass is ".." in the tree and "pass" for libs/board; points are the same', () => {
    assert.equal(boardMove('..'), 'pass');
    assert.equal(boardMove('dd'), 'dd');
    assert.equal(treeMove('pass'), '..');
    assert.equal(treeMove('dd'), 'dd');
  });

  test("the board for a line is the root's setup and the line's moves, passes included", () => {
    const root = readTree('(;GM[1]FF[4]SZ[9]KM[0.5]HA[2]AB[cc][gg]PL[W];W[ee];B[];W[ce])');
    const line = treeOps.mainlineNodeList(root) as Line;
    assert.deepEqual(boardSetup(line), {
      size: 9,
      ruleset: 'japanese',
      komi: 0.5,
      handicap: 2,
      stones: { black: ['cc', 'gg'], white: [] },
      toMove: 'white',
      moves: ['ee', 'pass', 'ce'],
    });
  });

  test('a node played on the tree with playFrom joins it with a two-character path', () => {
    const root = readTree('(;GM[1]FF[4]SZ[9])');
    const tree = makeTree<AnalyseNode>(root);
    const played = playFrom([root], boardMove('..'));
    assert.ok('node' in played);
    assert.equal(tree.addNode(played.node, ''), '..');
    assert.match(writeTree(root), /;B\[\]/);
  });
});

describe('sounds', () => {
  test('a capture sounds as one, a pass as a confirmation', () => {
    const root = readTree('(;GM[1]FF[4]SZ[9];B[ab];W[aa];B[ba];W[])');
    const [, b1, w1, b2, pass] = treeOps.mainlineNodeList(root);
    assert.equal(capturedBy(w1, b2), 1);
    assert.equal(capturedBy(root, b1), 0);
    assert.equal(capturedBy(b2, pass), 0);
    assert.deepEqual([b1.move, b2.move, pass.move], ['ab', 'ba', '..']);
    assert.equal(soundOf('ba', 1), 'capture');
    assert.equal(soundOf('ab', 0), 'move');
    assert.equal(soundOf('..', 0), 'confirmation');
  });
});

describe('a new position', () => {
  test('is an SGF root libs/board reads back with the same stones, rules and player', () => {
    const sgf = positionSgf({
      size: 13,
      ruleset: 'chinese',
      komi: 7.5,
      black: ['cc', 'jj'],
      white: ['cj'],
      toMove: 'white',
    });
    const s = readTree(sgf).settings;
    assert.equal(s.size, 13);
    assert.equal(s.ruleset, 'chinese');
    assert.equal(s.komi, 7.5);
    assert.deepEqual(s.black, ['cc', 'jj']);
    assert.deepEqual(s.white, ['cj']);
    assert.equal(s.toMove, 'white');
  });

  test('with a stone that has no liberties is refused by readTree', () => {
    const sgf = positionSgf({
      size: 9,
      ruleset: 'japanese',
      komi: 6.5,
      black: ['ba', 'ab'],
      white: ['aa'],
      toMove: 'black',
    });
    assert.throws(() => readTree(sgf), {
      name: 'SgfError',
      message: /the setup stone at aa has no liberties/,
    });
  });

  test('settings read as the side panel shows them', () => {
    const plain = readTree('(;GM[1]FF[4]SZ[19]RU[Japanese]KM[6.5])').settings;
    assert.equal(settingsText(plain), '19×19 · site.goRulesJapanese · site.goKomi 6.5');
    const handicap = readTree('(;GM[1]FF[4]SZ[19]RU[Chinese]KM[0.5]HA[3]AB[dd][pp][dp]PL[W])').settings;
    assert.equal(
      settingsText(handicap),
      '19×19 · site.goRulesChinese · site.goKomi 0.5 · site.goNbHandicapStones(3, 3)',
    );
  });
});
