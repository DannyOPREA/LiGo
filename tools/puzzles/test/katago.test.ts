// KataGo's second opinion with a real KataGo (the test network, as services/scoring's
// integration test uses): it agrees with the straight three, and catches a tree whose right and
// wrong answers are swapped. Skipped without KataGo, unless LIGO_REQUIRE_KATAGO=1 (CI sets it).
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { BLACK } from '../src/goban.ts';
import { SecondOpinion, setupFromEnv } from '../src/katago.ts';
import { parseDiagram, place } from '../src/position.ts';
import { buildPuzzle } from '../src/tree.ts';
import { straightThree } from './helpers.ts';

const setup = setupFromEnv();
if (!setup && process.env.LIGO_REQUIRE_KATAGO === '1') {
  throw new Error(
    'LIGO_REQUIRE_KATAGO=1 but KATAGO_BIN/KATAGO_TEST_NET are not set: the KataGo test would be skipped',
  );
}

test(
  'KataGo agrees with the straight three and catches swapped answers',
  { skip: setup ? false : 'KATAGO_BIN/KATAGO_TEST_NET not set (dev/ligo katago env)', timeout: 180_000 },
  async () => {
    const opinion = new SecondOpinion({ ...setup!, visits: 200 });
    try {
      assert.match(opinion.info.sha256, /^[0-9a-f]{64}$/);
      const pos = place(parseDiagram('. . . X O -\nX X X X O -\nO O O O O -\n- - - - - -'), 19, BLACK);
      const built = buildPuzzle(pos, BLACK);
      const puzzle = straightThree();
      assert.equal(await opinion.check(puzzle, pos, built), null);
      // Swap: call the vital point wrong (refuted by nothing) and a wrong move right.
      const swapped = structuredClone(built);
      swapped.tree.branches = [
        { x: 1, y: 0, wrong_answer: true },
        { x: 0, y: 0, correct_answer: true },
      ];
      assert.match((await opinion.check(puzzle, pos, swapped)) ?? '', /KataGo reads the defender as/);
    } finally {
      opinion.close();
    }
  },
);
