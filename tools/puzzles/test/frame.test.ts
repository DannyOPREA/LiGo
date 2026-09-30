// The tsumego frame port (src/frame.ts) against KaTrain's own Python on the same boards.
// fixtures/frame.json was made by running KaTrain's katrain/core/tsumego_frame.py (MIT, see
// LICENSE-katrain.txt), unchanged except for its two import lines, with komi 7, no ko threat and
// margin 2, on six catalogue positions (corner, edge and centre; both colours to play).
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { tsumegoFrame } from '../src/frame.ts';

interface Case {
  name: string;
  board: number[][];
  blackToPlay: boolean;
  framed: number[][];
}

const cases = JSON.parse(readFileSync(new URL('fixtures/frame.json', import.meta.url), 'utf8')) as Case[];

for (const c of cases) {
  test(`frame matches KaTrain: ${c.name}`, () => {
    assert.deepEqual(tsumegoFrame(c.board, 7, c.blackToPlay).board, c.framed);
  });
}

test('the frame leaves the problem itself alone', () => {
  for (const c of cases) {
    const framed = tsumegoFrame(c.board, 7, c.blackToPlay).board;
    c.board.forEach((row, y) =>
      row.forEach((v, x) => v && assert.equal(framed[y][x], v, `${c.name} at ${x},${y}`)),
    );
  }
});
