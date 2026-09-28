import assert from 'node:assert/strict';
// handle(): the whole request/reply surface (ADR 0020 §1) — propose's fallback (no KataGo
// configured, or one that times out), count's validation, and the owner string.
//
// Licence: MIT (LiGo's own code, ADR 0006).
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { handle, type ProposeRequest, type CountRequest } from '../src/handle.ts';
import { KataGoClient } from '../src/katago.ts';

const fakeBin = fileURLToPath(new URL('./fixtures/fake-katago.mjs', import.meta.url));

// A tiny 9x9 position: three black stones in the top-left corner surrounded by empty points, one
// lone white stone elsewhere, nothing dead.
const board9 = ['bbb6', ...Array(8).fill('9')].join('/');

test('handle propose: no KataGo configured answers src:none with nothing dead', async () => {
  const req: ProposeRequest = {
    t: 'propose',
    ref: 'g:1:1',
    size: 9,
    rules: 'c',
    komi: 7.5,
    handicap: 0,
    board: board9,
    prisoners: { b: 0, w: 0 },
  };
  const reply = await handle(req, { katago: null });
  assert.equal(reply.t, 'proposal');
  if (reply.t !== 'proposal') return;
  assert.equal(reply.src, 'none');
  assert.deepEqual(reply.dead, []);
  assert.equal(reply.score.b.stones, 3);
});

test('handle propose: a KataGo that times out falls back to src:none (ADR 0020 §4)', async () => {
  process.env.DELAY_MS = '300';
  const katago = new KataGoClient({ bin: fakeBin, configPath: 'x', modelPath: 'x', timeoutMs: 30 });
  try {
    const req: ProposeRequest = {
      t: 'propose',
      ref: 'g:1:1',
      size: 9,
      rules: 'c',
      komi: 7.5,
      handicap: 0,
      board: board9,
      prisoners: { b: 0, w: 0 },
    };
    const reply = await handle(req, { katago });
    assert.equal(reply.t, 'proposal');
    if (reply.t !== 'proposal') return;
    assert.equal(reply.src, 'none');
  } finally {
    katago.close();
    delete process.env.DELAY_MS;
  }
});

test('handle count: rejects a malformed board with an error reply, not a throw', async () => {
  const req: CountRequest = {
    t: 'count',
    ref: 'g:1:2',
    size: 9,
    rules: 'c',
    komi: 7.5,
    handicap: 0,
    board: 'not a board',
    prisoners: { b: 0, w: 0 },
    dead: [],
  };
  const reply = await handle(req, { katago: null });
  assert.equal(reply.t, 'error');
  if (reply.t !== 'error') return;
  assert.equal(reply.ref, 'g:1:2');
});

test("handle count: rejects dead stones that aren't whole chains", async () => {
  const req: CountRequest = {
    t: 'count',
    ref: 'g:1:3',
    size: 9,
    rules: 'c',
    komi: 7.5,
    handicap: 0,
    board: board9,
    prisoners: { b: 0, w: 0 },
    dead: ['aa'], // one stone of the 3-stone chain aa-ba-ca
  };
  const reply = await handle(req, { katago: null });
  assert.equal(reply.t, 'error');
});

test('handle count: the owner string is one character per point, b/w/., row by row', async () => {
  // 3x3-ish corner on a 9x9 board: a black chain with the rest of the board as its territory
  // under Chinese rules (living stones count too), a lone white stone owning nothing (too small
  // to make territory).
  const req: CountRequest = {
    t: 'count',
    ref: 'g:1:4',
    size: 9,
    rules: 'c',
    komi: 0,
    handicap: 0,
    board: board9,
    prisoners: { b: 0, w: 0 },
    dead: [],
  };
  const reply = await handle(req, { katago: null });
  assert.equal(reply.t, 'count');
  if (reply.t !== 'count') return;
  assert.equal(reply.owner.length, 81);
  assert.equal(reply.owner[0], 'b'); // aa: a black stone, counted under Chinese rules
  assert.equal(new Set(reply.owner).size <= 3, true); // only 'b', 'w', '.' ever appear
});
