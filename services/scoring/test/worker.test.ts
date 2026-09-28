import assert from 'node:assert/strict';
// Worker: the Redis-shaped wiring around handle() (unit 4.5, ADR 0020 §1) — dedup of re-sent
// requests, propose serialized through one KataGo while count runs immediately, and a handle()
// throw turned into an error reply rather than a crash. Driven by an in-process fake pub/sub, so
// these need no real Redis (test/worker-redis.test.ts covers the real thing); KataGo itself is
// the same fake process test/katago.test.ts uses, since Worker's Deps take a real KataGoClient.
//
// Licence: MIT (LiGo's own code, ADR 0006).
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import type { CountRequest, ProposeRequest, Reply } from '../src/handle.ts';
import { KataGoClient } from '../src/katago.ts';
import { IN_CHANNEL, OUT_CHANNEL, Worker, type Publisher, type Subscriber } from '../src/worker.ts';

const fakeBin = fileURLToPath(new URL('./fixtures/fake-katago.mjs', import.meta.url));
const board9 = ['bbb6', ...Array(8).fill('9')].join('/');

/** An in-process stand-in for two ioredis connections, sharing one bus the way Redis pub/sub
 * does: publish() delivers to every subscribed listener, synchronously-ish (queueMicrotask). */
class FakeBus {
  listeners: Array<(channel: string, message: string) => void> = [];
  published: { channel: string; message: string }[] = [];
}
class FakeSub implements Subscriber {
  private readonly bus: FakeBus;
  constructor(bus: FakeBus) {
    this.bus = bus;
  }
  async subscribe(): Promise<number> {
    return 1;
  }
  on(_event: 'message', listener: (channel: string, message: string) => void): void {
    this.bus.listeners.push(listener);
  }
}
class FakePub implements Publisher {
  private readonly bus: FakeBus;
  constructor(bus: FakeBus) {
    this.bus = bus;
  }
  async publish(channel: string, message: string): Promise<number> {
    this.bus.published.push({ channel, message });
    return 1;
  }
}

function send(bus: FakeBus, req: unknown): void {
  for (const l of bus.listeners) l(IN_CHANNEL, JSON.stringify(req));
}

/** Polls `bus.published` for a reply with this `ref` (skips the boot `start` message, which has
 * none), since Worker's own processing is async. */
async function waitForReply(bus: FakeBus, ref: string, timeoutMs = 2000): Promise<Reply> {
  const start = Date.now();
  for (;;) {
    const found = bus.published
      .map(p => JSON.parse(p.message) as Reply)
      .find(r => (r as { ref?: string }).ref === ref);
    if (found) return found;
    if (Date.now() - start > timeoutMs) throw new Error(`no reply for ${ref} within ${timeoutMs}ms`);
    await new Promise(r => setTimeout(r, 5));
  }
}

function countReq(ref: string, dead: string[] = []): CountRequest {
  return {
    t: 'count',
    ref,
    size: 9,
    rules: 'c',
    komi: 7.5,
    handicap: 0,
    board: board9,
    prisoners: { b: 0, w: 0 },
    dead,
  };
}
function proposeReq(ref: string): ProposeRequest {
  return {
    t: 'propose',
    ref,
    size: 9,
    rules: 'c',
    komi: 7.5,
    handicap: 0,
    board: board9,
    prisoners: { b: 0, w: 0 },
  };
}

test('Worker.start() announces {"t":"start"} once subscribed (ADR 0020 §1)', async () => {
  const bus = new FakeBus();
  const worker = new Worker(new FakePub(bus), new FakeSub(bus), { katago: null });
  await worker.start();
  assert.equal(bus.published.length, 1);
  assert.deepEqual(JSON.parse(bus.published[0].message), { t: 'start' });
  assert.equal(bus.published[0].channel, OUT_CHANNEL);
});

test('Worker: a count request is answered without KataGo', async () => {
  const bus = new FakeBus();
  const worker = new Worker(new FakePub(bus), new FakeSub(bus), { katago: null });
  await worker.start();
  send(bus, countReq('g1:1:1'));
  const reply = await waitForReply(bus, 'g1:1:1');
  assert.equal(reply.t, 'count');
});

test('Worker: a propose request with no KataGo configured answers src:none', async () => {
  const bus = new FakeBus();
  const worker = new Worker(new FakePub(bus), new FakeSub(bus), { katago: null });
  await worker.start();
  send(bus, proposeReq('g2:1:1'));
  const reply = await waitForReply(bus, 'g2:1:1');
  assert.equal(reply.t, 'proposal');
  if (reply.t !== 'proposal') return;
  assert.equal(reply.src, 'none');
});

test('Worker: a re-sent ref gets the cached reply republished, not recomputed', async () => {
  const bus = new FakeBus();
  let handled = 0;
  const katago = new KataGoClient({ bin: fakeBin, configPath: 'x', modelPath: 'x' });
  const origOwnership = katago.ownershipMaps.bind(katago);
  katago.ownershipMaps = (...args) => {
    handled += 1;
    return origOwnership(...args);
  };
  try {
    const worker = new Worker(new FakePub(bus), new FakeSub(bus), { katago });
    await worker.start();
    send(bus, proposeReq('g3:1:1'));
    await waitForReply(bus, 'g3:1:1');
    assert.equal(handled, 1);
    send(bus, proposeReq('g3:1:1')); // a re-send: same ref
    // Give it a moment; a second computation would also eventually answer, so check it stays at 1.
    await new Promise(r => setTimeout(r, 100));
    assert.equal(handled, 1, 're-send must not ask KataGo again');
    const replies = bus.published.filter(p => JSON.parse(p.message).ref === 'g3:1:1');
    assert.equal(replies.length, 2, 're-send still gets a reply (the cached one)');
    assert.deepEqual(JSON.parse(replies[0].message), JSON.parse(replies[1].message));
  } finally {
    katago.close();
  }
});

test('Worker: two propose requests serialize through the one KataGo (FIFO)', async () => {
  const bus = new FakeBus();
  process.env.DELAY_MS = '80';
  const katago = new KataGoClient({ bin: fakeBin, configPath: 'x', modelPath: 'x', timeoutMs: 5000 });
  try {
    const worker = new Worker(new FakePub(bus), new FakeSub(bus), { katago });
    await worker.start();
    const order: string[] = [];
    const orig = katago.ownershipMaps.bind(katago);
    katago.ownershipMaps = async (...args) => {
      order.push('start:' + args[0].length); // board is passed; just record a call happened
      const r = await orig(...args);
      order.push('end');
      return r;
    };
    send(bus, proposeReq('g4:1:1'));
    send(bus, proposeReq('g4:1:2')); // a different ref (e.g. a resume's new phase) sent right after
    const r1 = await waitForReply(bus, 'g4:1:1', 5000);
    const r2 = await waitForReply(bus, 'g4:1:2', 5000);
    assert.equal(r1.t, 'proposal');
    assert.equal(r2.t, 'proposal');
    // The second query only starts once the first has finished (FIFO, not interleaved).
    assert.deepEqual(order, ['start:9', 'end', 'start:9', 'end']);
  } finally {
    katago.close();
    delete process.env.DELAY_MS;
  }
});

test('Worker: count requests are not held up behind a slow propose', async () => {
  const bus = new FakeBus();
  process.env.DELAY_MS = '200';
  const katago = new KataGoClient({ bin: fakeBin, configPath: 'x', modelPath: 'x', timeoutMs: 5000 });
  try {
    const worker = new Worker(new FakePub(bus), new FakeSub(bus), { katago });
    await worker.start();
    send(bus, proposeReq('g5:1:1')); // slow (DELAY_MS=200)
    send(bus, countReq('g5:2:1')); // should not wait behind it
    const before = Date.now();
    const countReply = await waitForReply(bus, 'g5:2:1', 1000);
    const elapsed = Date.now() - before;
    assert.equal(countReply.t, 'count');
    assert.ok(elapsed < 150, `count answered in ${elapsed}ms, expected well under the 200ms propose delay`);
    await waitForReply(bus, 'g5:1:1', 5000); // let the slow propose finish before closing katago
  } finally {
    katago.close();
    delete process.env.DELAY_MS;
  }
});

test('Worker: a handle() bug becomes an error reply, not a crash (a game never stays without a proposal)', async () => {
  const bus = new FakeBus();
  const errors: string[] = [];
  const badKatago = {
    ownershipMaps: async () => {
      throw new TypeError('a bug, not a KataGo-unavailable condition');
    },
    close(): void {},
  } as unknown as KataGoClient;
  const worker = new Worker(
    new FakePub(bus),
    new FakeSub(bus),
    { katago: badKatago },
    { onError: m => errors.push(m) },
  );
  await worker.start();
  send(bus, proposeReq('g6:1:1'));
  const reply = await waitForReply(bus, 'g6:1:1');
  assert.equal(reply.t, 'error');
  assert.ok(errors.some(m => m.includes('g6:1:1')));
  // The worker keeps serving other requests after the bug (not stuck, not crashed).
  send(bus, countReq('g6:1:2'));
  const next = await waitForReply(bus, 'g6:1:2');
  assert.equal(next.t, 'count');
});

test('Worker: a message that is not JSON, or has no ref, is dropped and logged, not thrown', async () => {
  const bus = new FakeBus();
  const errors: string[] = [];
  const worker = new Worker(
    new FakePub(bus),
    new FakeSub(bus),
    { katago: null },
    { onError: m => errors.push(m) },
  );
  await worker.start();
  send(bus, 'not json {{{');
  bus.listeners[0](IN_CHANNEL, JSON.stringify({ t: 'count' })); // no ref
  await new Promise(r => setTimeout(r, 50));
  assert.equal(errors.length, 2);
  // Still works after both bad messages.
  send(bus, countReq('g7:1:1'));
  const reply = await waitForReply(bus, 'g7:1:1');
  assert.equal(reply.t, 'count');
});

test('Worker: null, an array or a bare number are valid JSON but not a request — dropped, not thrown', async () => {
  // Reproduces a real crash: `JSON.parse('null')` succeeds, and reading `.ref` off the result
  // (or off an array or a number) used to throw synchronously inside ioredis's `emit('message')`
  // — an uncaught exception that took the whole process down (`redis-cli publish scoring-in null`
  // reproduced it against the real worker). None of these are thrown here: the listener call
  // itself must not throw, which is the whole point of the test — a bug in the fix under test
  // would surface as this test itself throwing (node:test doesn't catch a listener's throw any
  // more gracefully than ioredis does), not as a normal assertion failure.
  const bus = new FakeBus();
  const errors: string[] = [];
  const worker = new Worker(
    new FakePub(bus),
    new FakeSub(bus),
    { katago: null },
    { onError: m => errors.push(m) },
  );
  await worker.start();
  for (const raw of ['null', '[]', '5']) {
    assert.doesNotThrow(() => bus.listeners[0](IN_CHANNEL, raw));
  }
  await new Promise(r => setTimeout(r, 50));
  assert.equal(errors.length, 3);
  // Still works after all three malformed messages.
  send(bus, countReq('g8:1:1'));
  const reply = await waitForReply(bus, 'g8:1:1');
  assert.equal(reply.t, 'count');
});
