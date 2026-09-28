#!/usr/bin/env node
// The real entry point (unit 4.5): wires `Worker` (src/worker.ts) to two ioredis connections and
// this service's one KataGo client, and keeps running until told to stop.
//
// Env:
//   SCORING_REDIS_URL   Redis connection string (default redis://127.0.0.1:6379, lila's own
//                        default in lila/conf/base.conf).
//   KATAGO_BIN/KATAGO_MODEL/KATAGO_CONFIG   As src/cli.ts: unset means every `propose` answers
//                        `src:"none"` (ADR 0020 §4), same as a KataGo that can't be reached.
//
// Redis client: ioredis 6.0.0 (MIT; COPYING.md, services/scoring/NOTICE.md) — a well-known,
// actively maintained client (BullMQ and many other Node services depend on it), chosen over
// the official `redis` package for its automatic reconnect *and* automatic re-subscription to
// `scoring-in` after a reconnect, which this worker relies on rather than reimplementing
// (logs/decisions.md). Both connections keep ioredis's default `enableOfflineQueue: true`: a
// `publish` issued while disconnected is queued and sent once the connection is back, rather
// than dropped — safe here since lila re-sends a request it never got a reply to (ADR 0020 §1),
// so a late reply is still useful and a lost one is recovered by the re-send.
//
// Disconnect handling: ioredis reconnects on its own (exponential backoff, unbounded retries by
// default) and resubscribes `scoring-in` once reconnected; this file only logs the transitions
// (`error`, `reconnecting`, `ready`) rather than acting on them, since acting on them is exactly
// what ioredis and the `Worker`'s dedup/re-send handling already do. `Worker.start()` publishes
// `{"t":"start"}` once on boot (ADR 0020 §1); it does not re-announce `start` after a Redis
// reconnect, since a reconnect doesn't restart this process or its KataGo client — the "a game
// never stays without a proposal" guarantee there is lila's own re-send timer, not another
// `start`.
//
// Licence: MIT (LiGo's own code, ADR 0006).
import { Redis } from 'ioredis';

import { KataGoClient } from './katago.ts';
import { IN_CHANNEL, OUT_CHANNEL, Worker, type Subscriber } from './worker.ts';

function log(message: string): void {
  console.error(`[scoring] ${message}`);
}

async function main(): Promise<void> {
  const redisUrl = process.env.SCORING_REDIS_URL ?? 'redis://127.0.0.1:6379';
  const katago =
    process.env.KATAGO_BIN && process.env.KATAGO_MODEL && process.env.KATAGO_CONFIG
      ? new KataGoClient({
          bin: process.env.KATAGO_BIN,
          modelPath: process.env.KATAGO_MODEL,
          configPath: process.env.KATAGO_CONFIG,
        })
      : null;
  if (!katago) log('KATAGO_BIN/KATAGO_MODEL/KATAGO_CONFIG not set: every propose will answer src:"none"');

  // Two connections: once `sub.subscribe()` is called, ioredis puts that connection into
  // subscriber mode, where it can no longer run `publish` (or anything else) — the same split
  // fishnet's own Redis client used (ADR 0020's context).
  const pub = new Redis(redisUrl, { lazyConnect: false });
  const sub = new Redis(redisUrl, { lazyConnect: false });
  for (const [name, client] of [
    ['pub', pub],
    ['sub', sub],
  ] as const) {
    client.on('error', (e: Error) => log(`${name} connection error: ${e.message}`));
    client.on('reconnecting', () => log(`${name} connection lost; reconnecting`));
    client.on('ready', () => log(`${name} connection ready`));
  }

  // ioredis's own `subscribe` is typed for its variadic multi-channel/callback overloads, which
  // don't structurally match Worker's single-channel `Subscriber`; this adapter is the one place
  // that bridges the two, so `worker.ts` itself stays free of any particular Redis client's types.
  const subAdapter: Subscriber = {
    subscribe: (channel: string): Promise<number> => sub.subscribe(channel) as Promise<number>,
    on: (event, listener) => {
      sub.on(event, listener);
    },
  };
  const worker = new Worker(
    pub,
    subAdapter,
    { katago },
    { onError: (m, e) => log(`${m}${e ? `: ${e}` : ''}`) },
  );
  await worker.start();
  log(`listening on ${IN_CHANNEL}, replying on ${OUT_CHANNEL} (${redisUrl})`);

  let stopping = false;
  const stop = async (signal: string): Promise<void> => {
    if (stopping) return;
    stopping = true;
    log(`${signal}: shutting down`);
    katago?.close();
    await Promise.allSettled([pub.quit(), sub.quit()]);
    process.exit(0);
  };
  process.on('SIGTERM', () => void stop('SIGTERM'));
  process.on('SIGINT', () => void stop('SIGINT'));
}

main().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
