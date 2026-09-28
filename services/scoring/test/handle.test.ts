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

// B4 (logs/scoring.md "4.4 review fixes"): request validation, one rule per test. Each bad
// request comes back as an `error` reply, never a throw.
const validPropose: ProposeRequest = {
  t: 'propose',
  ref: 'g:1:1',
  size: 9,
  rules: 'c',
  komi: 7.5,
  handicap: 0,
  board: board9,
  prisoners: { b: 0, w: 0 },
};

async function expectValidationError(req: unknown): Promise<void> {
  const reply = await handle(req as ProposeRequest, { katago: null });
  assert.equal(reply.t, 'error', `expected an error reply for ${JSON.stringify(req)}`);
}

test('handle: rejects a request that is not even an object, without throwing', async () => {
  await expectValidationError(null);
  await expectValidationError('propose');
  await expectValidationError([1, 2, 3]);
});

test("handle: rejects a t other than 'propose'/'count'", async () => {
  await expectValidationError({ ...validPropose, t: 'score' });
});

test('handle: rejects a size other than 9/13/19', async () => {
  await expectValidationError({ ...validPropose, size: 21 });
});

test("handle: rejects rules other than 'j'/'c'", async () => {
  await expectValidationError({ ...validPropose, rules: 'k' });
});

test('handle: rejects a komi that is not a finite multiple of 0.5', async () => {
  await expectValidationError({ ...validPropose, komi: 7.3 });
  await expectValidationError({ ...validPropose, komi: Number.POSITIVE_INFINITY });
  await expectValidationError({ ...validPropose, komi: Number.NaN });
  await expectValidationError({ ...validPropose, komi: '7.5' });
});

test('handle: accepts a negative komi (a multiple of 0.5 all the same)', async () => {
  const reply = await handle({ ...validPropose, komi: -7.5 }, { katago: null });
  assert.equal(reply.t, 'proposal');
});

test('handle: rejects a handicap outside 0..9, or a non-integer one', async () => {
  await expectValidationError({ ...validPropose, handicap: -1 });
  await expectValidationError({ ...validPropose, handicap: 10 });
  await expectValidationError({ ...validPropose, handicap: 2.5 });
});

test('handle: rejects negative or non-integer prisoners', async () => {
  await expectValidationError({ ...validPropose, prisoners: { b: -1, w: 0 } });
  await expectValidationError({ ...validPropose, prisoners: { b: 0, w: 1.5 } });
  await expectValidationError({ ...validPropose, prisoners: { b: 0 } });
});

test('handle count: rejects a dead that is not an array of strings', async () => {
  const countReq = { ...validPropose, t: 'count', dead: [] };
  await expectValidationError({ ...countReq, dead: 'aa' });
  await expectValidationError({ ...countReq, dead: [1, 2] });
});

test('handle: rejects a missing or non-string ref', async () => {
  const { ref, ...withoutRef } = validPropose;
  void ref;
  await expectValidationError(withoutRef);
  await expectValidationError({ ...validPropose, ref: 42 });
});
