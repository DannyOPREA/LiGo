import { Redis } from 'ioredis';
import assert from 'node:assert/strict';
// A real round trip: a real `redis-server` (started on a free port for this test only, torn down
// after), two real ioredis connections, and Worker on top of them. Skipped, not failed, when
// `redis-server` isn't on PATH (unit 4.5's brief). test/worker.test.ts covers the worker's own
// logic against a fake pub/sub; this test is only here to prove the real Redis wiring (channel
// names, JSON framing, ioredis's subscribe/publish split) actually works end to end.
//
// LIGO_REQUIRE_REDIS=1 turns a missing `redis-server` into a failure instead of a skip, the same
// pattern test/integration.test.ts uses for LIGO_REQUIRE_KATAGO: the `scoring` CI job installs
// redis-server itself, so a skip there would mean this test silently never ran.
//
// Licence: MIT (LiGo's own code, ADR 0006).
import { type ChildProcess, spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import type { CountRequest, ProposeRequest, Reply } from '../src/handle.ts';
import { IN_CHANNEL, OUT_CHANNEL, Worker, type Subscriber } from '../src/worker.ts';

function commandExists(cmd: string): boolean {
  const path = process.env.PATH ?? '';
  return path.split(':').some(dir => {
    try {
      return statSync(join(dir, cmd)).isFile();
    } catch {
      return false;
    }
  });
}

/** Polls `received` for a reply with this `ref` (a real Redis round trip is genuinely async, and
 * `lilaSide`'s `message` handler above pushes onto `received` as replies arrive). */
async function waitForReply(received: Reply[], ref: string, timeoutMs = 5000): Promise<Reply> {
  const start = Date.now();
  for (;;) {
    const found = received.find(r => (r as { ref?: string }).ref === ref);
    if (found) return found;
    if (Date.now() - start > timeoutMs) throw new Error(`no reply for ${ref} within ${timeoutMs}ms`);
    await new Promise(r => setTimeout(r, 20));
  }
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      srv.close(() => {
        if (addr && typeof addr === 'object') resolve(addr.port);
        else reject(new Error('could not find a free port'));
      });
    });
    srv.on('error', reject);
  });
}

async function startRedis(): Promise<{ proc: ChildProcess; port: number; dir: string }> {
  const port = await freePort();
  const dir = await mkdtemp(join(tmpdir(), 'ligo-scoring-redis-'));
  const proc = spawn(
    'redis-server',
    ['--port', String(port), '--bind', '127.0.0.1', '--daemonize', 'no', '--save', '', '--dir', dir],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  await new Promise<void>((resolve, reject) => {
    let out = '';
    const timer = setTimeout(() => reject(new Error(`redis-server did not start within 5s: ${out}`)), 5000);
    const onData = (chunk: Buffer): void => {
      out += chunk.toString();
      if (/Ready to accept connections/.test(out)) {
        proc.stdout?.off('data', onData);
        clearTimeout(timer);
        resolve();
      }
    };
    proc.stdout?.on('data', onData);
    proc.on('error', reject);
    proc.on('exit', code => reject(new Error(`redis-server exited early (code ${code}): ${out}`)));
  });
  return { proc, port, dir };
}

const hasRedis = commandExists('redis-server');
if (!hasRedis && process.env.LIGO_REQUIRE_REDIS === '1') {
  throw new Error('LIGO_REQUIRE_REDIS=1 but redis-server is not on PATH: this test would be skipped');
}

test(
  'Worker over a real Redis: propose then count, round-tripped through scoring-in/scoring-out',
  { skip: hasRedis ? false : 'redis-server not found on PATH' },
  async () => {
    const { proc, port, dir } = await startRedis();
    let pub: Redis | undefined, sub: Redis | undefined, lilaSide: Redis | undefined;
    try {
      const url = `redis://127.0.0.1:${port}`;
      pub = new Redis(url);
      sub = new Redis(url);
      // A third connection standing in for lila: it subscribes to scoring-out and publishes to
      // scoring-in, exactly as ADR 0020 §1 describes lila's side of the wire.
      lilaSide = new Redis(url);

      const received: Reply[] = [];
      const gotStart = new Promise<void>(resolve => {
        lilaSide!.on('message', (channel, message) => {
          const msg = JSON.parse(message) as Reply | { t: 'start' };
          if (channel === OUT_CHANNEL && msg.t === 'start') resolve();
          else received.push(msg as Reply);
        });
      });
      await lilaSide.subscribe(OUT_CHANNEL);

      // See src/main.ts's own subAdapter: ioredis's `subscribe` type doesn't structurally match
      // Worker's single-channel `Subscriber`.
      const subAdapter: Subscriber = {
        subscribe: (channel: string): Promise<number> => sub!.subscribe(channel) as Promise<number>,
        on: (event, listener) => {
          sub!.on(event, listener);
        },
      };
      const worker = new Worker(pub, subAdapter, { katago: null });
      await worker.start();
      await gotStart; // ADR 0020 §1: the service announces `start` on boot

      const board9 = ['bbb6', ...Array(8).fill('9')].join('/');

      // propose: no KataGo configured (`katago: null`), so this exercises the real Redis wiring
      // for a `proposal` reply (src:"none") rather than a `count` reply's shape.
      const proposeReq: ProposeRequest = {
        t: 'propose',
        ref: 'realredis:1:1',
        size: 9,
        rules: 'c',
        komi: 7.5,
        handicap: 0,
        board: board9,
        prisoners: { b: 0, w: 0 },
      };
      await lilaSide.publish(IN_CHANNEL, JSON.stringify(proposeReq));
      const proposal = await waitForReply(received, 'realredis:1:1');
      assert.equal(proposal.t, 'proposal');
      if (proposal.t !== 'proposal') return;
      assert.equal(proposal.src, 'none');

      // count: a second request, a different `ref` (the next request number in the same phase,
      // ADR 0020 §1), over the same connections — proves both request types round-trip, not just
      // whichever one this test happened to send first.
      const countReq: CountRequest = {
        t: 'count',
        ref: 'realredis:1:2',
        size: 9,
        rules: 'c',
        komi: 7.5,
        handicap: 0,
        board: board9,
        prisoners: { b: 0, w: 0 },
        dead: proposal.dead,
      };
      await lilaSide.publish(IN_CHANNEL, JSON.stringify(countReq));
      const count = await waitForReply(received, 'realredis:1:2');
      assert.equal(count.t, 'count');
      if (count.t !== 'count') return;
      assert.equal(count.owner.length, 81);
    } finally {
      pub?.disconnect();
      sub?.disconnect();
      lilaSide?.disconnect();
      proc.kill();
      await new Promise(r => proc.once('exit', r));
      await rm(dir, { recursive: true, force: true });
    }
  },
);
