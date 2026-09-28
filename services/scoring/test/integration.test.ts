import assert from 'node:assert/strict';
import { existsSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
// One real KataGo analysis on a small 9x9 game (unit 4.4 scope): only runs when KATAGO_BIN (and
// KATAGO_TEST_NET) are set, as `dev/ligo katago env` prints them — otherwise skipped, since most
// dev and CI runs won't have KataGo installed. The analysis config isn't one of `katago env`'s
// variables (that one's `KATAGO_GTP_CONFIG` is for GTP); it lives next to the binary in the
// installed release directory, found from KATAGO_BIN rather than hard-coded (dev/katago.sh
// unpacks it there for every backend and every version).
//
// Licence: MIT (LiGo's own code, ADR 0006).
import { test } from 'node:test';

import { handle, type ProposeRequest } from '../src/handle.ts';
import { KataGoClient } from '../src/katago.ts';

const bin = process.env.KATAGO_BIN;
const model = process.env.KATAGO_TEST_NET;
const configPath = bin ? join(dirname(realpathSync(bin)), 'analysis_example.cfg') : undefined;

test(
  'integration: a real KataGo proposes a score for a finished 9x9 game',
  {
    skip:
      !bin || !model || !configPath || !existsSync(configPath)
        ? 'KATAGO_BIN/KATAGO_TEST_NET not set (dev/ligo katago install; dev/ligo katago env)'
        : false,
  },
  async () => {
    const katago = new KataGoClient({ bin: bin!, modelPath: model!, configPath: configPath! });
    try {
      // A small won position: Black holds the top three rows, White the bottom two, both alive.
      const board = [
        'bbbbbbbbb',
        'bbbbbbbbb',
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
    } finally {
      katago.close();
    }
  },
);
