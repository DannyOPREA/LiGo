import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { clampSteps, rankIndex, rankRange, type RankTable } from '../src/rankRange';

// GoRating.rankTable, the copy unit 5.6's page test keeps (checked against the server by GoRatingTest)
const table: RankTable = JSON.parse(
  readFileSync(new URL('../../playground/e2e/rank-table.json', import.meta.url), 'utf8'),
);
const edge = (name: string) => table.find(([n]) => n === name)![1];

test('a rating falls in the rank whose lower edge is at or below it', () => {
  assert.equal(table[rankIndex(table, edge('5k'))][0], '5k');
  assert.equal(table[rankIndex(table, edge('4k') - 1)][0], '5k');
  assert.equal(table[rankIndex(table, 100)][0], '25k');
  assert.equal(table[rankIndex(table, 3500)][0], '9d');
});

test('a 5k with two ranks below and three above looks for 7k to 2k', () => {
  const r = rankRange(table, edge('5k') + 10, -2, 3);
  assert.deepEqual([r.from, r.to], ['7k', '2k']);
  assert.equal(r.min, edge('7k'));
  assert.equal(r.max, edge('1k') - 1);
});

test("the range stays inside lila's 400-2900 limits at both ends of the table", () => {
  const weak = rankRange(table, edge('25k'), -9, 0);
  assert.equal(weak.from, '25k');
  assert.ok(weak.min >= 400);
  const strong = rankRange(table, edge('9d'), 0, 9);
  assert.equal(strong.to, '9d');
  assert.equal(strong.max, 2900);
  assert.ok(strong.min < strong.max);
});

test('old rating-point slider values become the widest rank range', () => {
  assert.equal(clampSteps(-500, -1), -9);
  assert.equal(clampSteps(500, 1), 9);
  assert.equal(clampSteps(-2, -1), -2);
  assert.equal(clampSteps(3, 1), 3);
  assert.equal(clampSteps(0.5, 1), 9);
});
