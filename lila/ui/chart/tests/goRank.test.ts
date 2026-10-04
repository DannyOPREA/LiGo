import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { type RankTable, rankAt, rankBounds, rankTicks } from '../src/goRank';

// a slice of GoRating.rankTable (lila/modules/rating; all of it in ui/playground/e2e/rank-table.json)
const table: RankTable = [
  ['3k', 1686],
  ['2k', 1760],
  ['1k', 1838],
  ['1d', 1919],
  ['2d', 2004],
];

describe('the kyu/dan axis of the rating graph', () => {
  test('a rating shows the rank whose edge it last reached', () => {
    assert.equal(rankAt(table, 1838), '1k');
    assert.equal(rankAt(table, 1918.9), '1k', 'the whole rating, as every other page labels it');
    assert.equal(rankAt(table, 1919), '1d');
  });

  test('ratings beyond the table show its first and last ranks', () => {
    assert.equal(rankAt(table, 1000), '3k');
    assert.equal(rankAt(table, 3000), '2d');
  });

  test('ticks sit on the rank edges inside the view', () => {
    assert.deepEqual(rankTicks(table, 1700, 1950), [1760, 1838, 1919]);
  });

  test('a wide view keeps every n-th rank, counted from the weakest, so labels stay put', () => {
    assert.deepEqual(rankTicks(table, 0, 3000, 3), [1686, 1838, 2004]);
    assert.deepEqual(rankTicks(table, 1700, 3000, 2), [1838, 2004]);
  });

  test("a rating that stays inside one rank still shows that rank's two edges", () => {
    assert.deepEqual(rankBounds(table, 1770, 1800), [1760, 1838]);
    assert.deepEqual(rankBounds(table, 1000, 1700), [1000, 1760], 'below the table stays as it is');
    assert.deepEqual(rankBounds(table, 2010, 3000), [2004, 3000], 'above the table stays as it is');
  });
});
