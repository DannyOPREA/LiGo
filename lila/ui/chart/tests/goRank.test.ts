import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { type RankTable, rankAt, rankBounds, rankTicks } from '../src/goRank';

// a slice of GoRating.rankTable (lila/modules/rating), enough for the edges
const table: RankTable = [
  ['3k', 1785],
  ['2k', 1851],
  ['1k', 1919],
  ['1d', 1989],
  ['2d', 2062],
];

describe('the kyu/dan axis of the rating graph', () => {
  test('a rating shows the rank whose edge it last reached', () => {
    assert.equal(rankAt(table, 1919), '1k');
    assert.equal(rankAt(table, 1988.9), '1k', 'the whole rating, as every other page labels it');
    assert.equal(rankAt(table, 1989), '1d');
  });

  test('ratings beyond the table show its first and last ranks', () => {
    assert.equal(rankAt(table, 1000), '3k');
    assert.equal(rankAt(table, 3000), '2d');
  });

  test('ticks sit on the rank edges inside the view', () => {
    assert.deepEqual(rankTicks(table, 1800, 2000), [1851, 1919, 1989]);
  });

  test('a wide view keeps every n-th rank, counted from the weakest, so labels stay put', () => {
    assert.deepEqual(rankTicks(table, 0, 3000, 3), [1785, 1919, 2062]);
    assert.deepEqual(rankTicks(table, 1800, 3000, 2), [1919, 2062]);
  });

  test("a rating that stays inside one rank still shows that rank's two edges", () => {
    assert.deepEqual(rankBounds(table, 1860, 1900), [1851, 1919]);
    assert.deepEqual(rankBounds(table, 1000, 1800), [1000, 1851], 'below the table stays as it is');
    assert.deepEqual(rankBounds(table, 2070, 3000), [2062, 3000], 'above the table stays as it is');
  });
});
