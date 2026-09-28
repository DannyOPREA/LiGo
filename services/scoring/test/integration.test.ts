import assert from 'node:assert/strict';
import { existsSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
// One real KataGo analysis on a small 9x9 game (unit 4.4 scope): only runs when KATAGO_BIN (and
// KATAGO_TEST_NET) are set, as `dev/ligo katago env` prints them (`dev/ligo test scoring` now
// loads them itself when KataGo is installed) — otherwise skipped, since most dev and CI runs
// won't have KataGo installed. The analysis config isn't one of `katago env`'s variables (that
// one's `KATAGO_GTP_CONFIG` is for GTP); it lives next to the binary in the installed release
// directory, found from KATAGO_BIN rather than hard-coded (dev/katago.sh unpacks it there for
// every backend and every version).
//
// LIGO_REQUIRE_KATAGO=1 turns a missing KataGo into a failure instead of a skip: the `scoring` CI
// job sets it, since CI always installs KataGo (dev/katago.sh install cpu) and a silent skip
// there would mean this test never actually ran (review finding, logs/scoring.md "4.4 review
// fixes": the earlier "82/82 including the real KataGo test" log line was wrong for exactly this
// reason — dev/ligo didn't export the env, so this test was skipped, not passing).
//
// Licence: MIT (LiGo's own code, ADR 0006).
import { test } from 'node:test';

import { handle, type ProposeRequest } from '../src/handle.ts';
import { KataGoClient } from '../src/katago.ts';

const bin = process.env.KATAGO_BIN;
const model = process.env.KATAGO_TEST_NET;
const configPath = bin ? join(dirname(realpathSync(bin)), 'analysis_example.cfg') : undefined;
const ready = !!bin && !!model && !!configPath && existsSync(configPath);

if (!ready && process.env.LIGO_REQUIRE_KATAGO === '1') {
  throw new Error(
    'LIGO_REQUIRE_KATAGO=1 but KATAGO_BIN/KATAGO_TEST_NET are not set: the real-KataGo test would be skipped',
  );
}

test(
  'integration: a real KataGo proposes a score for a finished 9x9 game',
  {
    skip: ready ? false : 'KATAGO_BIN/KATAGO_TEST_NET not set (dev/ligo katago install; dev/ligo katago env)',
  },
  async () => {
    const katago = new KataGoClient({ bin: bin!, modelPath: model!, configPath: configPath! });
    try {
      // A small won position: Black holds the top three rows, White the bottom two, both alive,
      // plus one lone White stone (x=4, y=1, SGF point "eb") deep inside Black's area with no
      // hope of living — the review's B1 case (logs/scoring.md "4.4 review fixes"): a copy of
      // this board must reach `autoscore`, or every proposal comes back with nothing dead.
      const board = [
        'bbbbbbbbb',
        'bbbbwbbbb',
        'bbbbbbbbb',
        '9',
        '9',
        '9',
        '9',
        'wwwwwwwww',
        'wwwwwwwww',
      ].join('/');
      const req: ProposeRequest = {
        t: 'propose',
        ref: 'integration:1:1',
        size: 9,
        rules: 'c',
        komi: 7.5,
        handicap: 0,
        board,
        toMove: 'b',
        prisoners: { b: 0, w: 0 },
      };
      const reply = await handle(req, { katago });
      assert.equal(reply.t, 'proposal');
      if (reply.t !== 'proposal') return;
      assert.equal(reply.src, 'katago');
      assert.equal(reply.owner.length, 81);
      assert.ok(reply.score.b.total > 0);
      assert.ok(reply.score.w.total > 0);
      assert.ok(
        reply.dead.includes('eb'),
        `expected the lone White stone at 'eb' to be proposed dead, got ${JSON.stringify(reply.dead)}`,
      );
    } finally {
      katago.close();
    }
  },
);
