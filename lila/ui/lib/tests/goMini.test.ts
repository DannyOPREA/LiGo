import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { goMiniRows, goMiniShapes, goMiniStars } from '../src/view/goMini';

// LiGo (unit 3.19, mini-board slice): what a Go mini board draws from lila-ws's compact board string.
describe('Go mini boards', () => {
  test('reads a compact board into rows of points', () => {
    assert.deepEqual(goMiniRows('1b7/b8/9/9/9/9/9/9/9')?.slice(0, 3), [
      '.b.......',
      'b........',
      '.........',
    ]);
    assert.equal(goMiniRows('19/'.repeat(18) + '19')?.length, 19);
  });

  test('refuses anything that is not a square board', () => {
    assert.equal(goMiniRows('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR'), undefined);
    assert.equal(goMiniRows('9/9/9'), undefined);
    assert.equal(goMiniRows('<script>'), undefined);
    assert.equal(goMiniShapes('8/8'), undefined);
  });

  test('puts the star points where goban does', () => {
    assert.deepEqual(goMiniStars(9), [
      [2, 2],
      [6, 2],
      [2, 6],
      [6, 6],
      [4, 4],
    ]);
    assert.equal(goMiniStars(13).length, 5);
    assert.deepEqual(goMiniStars(13).at(-1), [6, 6]);
    assert.equal(goMiniStars(19).length, 9);
    assert.ok(goMiniStars(19).some(([c, r]) => c === 3 && r === 9));
  });

  test('draws each stone at its point, and rings the last stone played', () => {
    const shapes = goMiniShapes('1b7/b8/9/9/9/9/9/9/9', 'ab')!;
    assert.equal(shapes.size, 9);
    const stones = shapes.circles.filter(c => c.cls === 'black' || c.cls === 'white');
    assert.deepEqual(
      stones.map(c => [c.cls, c.cx, c.cy]),
      [
        ['black', 1.5, 0.5],
        ['black', 0.5, 1.5],
      ],
    );
    assert.deepEqual(
      shapes.circles.filter(c => c.cls.startsWith('last')).map(c => [c.cls, c.cx, c.cy]),
      [['last on-black', 0.5, 1.5]],
    );
  });

  test('no ring after a pass, before the first move, or on a captured point', () => {
    const rings = (lm?: string) =>
      goMiniShapes('1b7/b8/9/9/9/9/9/9/9', lm)!.circles.filter(c => c.cls.startsWith('last'));
    assert.equal(rings('pass').length, 0);
    assert.equal(rings('').length, 0);
    assert.equal(rings(undefined).length, 0);
    assert.equal(rings('aa').length, 0); // the white stone Black took
    assert.equal(rings('zz').length, 0);
  });
});
