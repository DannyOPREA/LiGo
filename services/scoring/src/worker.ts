// The Redis worker (unit 4.5, ADR 0020 §1): wraps `handle()` in the two pub/sub channels lila
// talks over — `scoring-in` (lila → service) and `scoring-out` (service → lila) — and sends
// `{"t":"start"}` on boot so lila knows to re-send whatever it was waiting on.
//
// This module knows nothing about a specific Redis client: `Publisher`/`Subscriber` are the
// slice of ioredis's own interface it needs (`publish`, `subscribe`, `on('message', ...)`), so
// `test/worker.test.ts` can drive it with an in-process fake pub/sub and `src/main.ts` (the real
// entry point) can pass it two ioredis connections unchanged.
//
// Concurrency (logs/decisions.md): `count` never asks KataGo (ADR 0020 §1's own rule), so
// recounts run as soon as they arrive, however many are in flight at once — they're a fast,
// deterministic goscorer call. `propose` queries the one KataGo process this service runs, so
// only one is ever in flight: a second `propose` waits behind the first rather than the two
// racing for the same CPU/GPU. This keeps KataGo's own concurrency (and its config's thread
// count) simple to reason about, at the cost of one game's proposal queuing behind another's; a
// future unit can split the queue per game if that queuing is ever felt in practice.
//
// Re-sent requests (ADR 0020 §1: lila re-sends the latest unanswered request of a game on
// `start`, when its round loads, and every 30s while one is outstanding) are deduplicated by
// `ref`: a `ref` this worker has already answered gets its cached reply re-published instead of
// being recomputed (free, and safe for `propose` to repeat since KataGo's judgement isn't
// wanted twice); a `ref` still being worked on is dropped silently, since the in-flight request
// will answer it once it completes. The cache is bounded (LRU-ish: oldest ref evicted first) so
// a long-running worker's memory doesn't grow without bound.
//
// A game never stays without a proposal (this unit's brief): `handle()` itself never throws for
// a request-shaped failure (it returns an `error` reply), and KataGoClient falls back to
// `src:"none"` on its own crash or timeout (ADR 0020 §4) and respawns lazily on the next query.
// The one thing left for this module to guard is a bug in `handle()` itself (a real throw): that
// is caught here too and turned into an `error` reply, logged to stderr, so a single bad request
// never leaves the worker silent for a game or takes the process down.
//
// Licence: MIT (LiGo's own code, ADR 0006).
import { handle, type Deps, type Reply, type Request } from './handle.ts';

export const IN_CHANNEL = 'scoring-in';
export const OUT_CHANNEL = 'scoring-out';

/** The slice of ioredis's publisher interface this module needs. */
export interface Publisher {
  /** Resolves with the number of subscribers that received the message (ioredis's own return). */
  publish(channel: string, message: string): Promise<number>;
}
/** The slice of ioredis's subscriber interface this module needs. A subscriber connection can
 * only (un)subscribe and receive `message` events (ioredis puts it in subscriber mode), so this
 * is deliberately not the same object as `Publisher`. */
export interface Subscriber {
  /** Resolves with the number of channels this connection is now subscribed to. */
  subscribe(channel: string): Promise<number>;
  on(event: 'message', listener: (channel: string, message: string) => void): void;
}

export interface WorkerOptions {
  /** How many `ref`s worth of replies to remember for dedup (default 500: comfortably more than
   * the games likely to be mid-scoring-phase at once in this project's scale). */
  cacheSize?: number;
  /** Called on anything worth a line in the worker's log: a bad message, a `handle()` throw, a
   * publish failure. Defaults to `console.error`. */
  onError?: (message: string, err?: unknown) => void;
}

/** Turns lila's `scoring-in` messages into `scoring-out` replies (ADR 0020 §1). Construct one,
 * call `start()` once the Redis connections are ready. It holds no resources of its own to
 * release: shutting down means closing the `Publisher`/`Subscriber` connections it was given
 * (`src/main.ts` does this on SIGTERM/SIGINT) and, if the caller wants a clean stop, letting any
 * in-flight `handle()` calls finish first. */
export class Worker {
  private readonly cacheSize: number;
  private readonly onError: (message: string, err?: unknown) => void;
  private readonly replyCache = new Map<string, Reply>();
  private readonly inFlight = new Set<string>();
  private proposeQueue: Promise<void> = Promise.resolve();
  // ioredis (like Node's EventEmitter in general) does not catch a listener's throw: it
  // propagates straight out of `emit()`, synchronously, into whatever code path delivered the
  // message — an uncaught exception that kills the process. `onMessage` guards its own inputs
  // (JSON.parse, the parsed shape), but this wrapper is the last line of defence against any
  // other throw reaching ioredis, since "a game never stays without a proposal" also means this
  // worker itself must never die from one malformed or unexpected message.
  private readonly listener = (channel: string, message: string): void => {
    if (channel !== IN_CHANNEL) return;
    try {
      this.onMessage(message);
    } catch (e) {
      this.onError(`onMessage threw for a scoring-in message (a worker bug): ${message.slice(0, 200)}`, e);
    }
  };

  private readonly pub: Publisher;
  private readonly sub: Subscriber;
  private readonly deps: Deps;

  constructor(pub: Publisher, sub: Subscriber, deps: Deps, opts: WorkerOptions = {}) {
    this.pub = pub;
    this.sub = sub;
    this.deps = deps;
    this.cacheSize = opts.cacheSize ?? 500;
    this.onError =
      opts.onError ?? ((message, err) => console.error(`[scoring-worker] ${message}`, err ?? ''));
  }

  /** Subscribes and announces `{"t":"start"}` (ADR 0020 §1: lila re-sends its latest unanswered
   * request for every loaded round on this). Call once, after the Redis connections are up. */
  async start(): Promise<void> {
    this.sub.on('message', this.listener);
    await this.sub.subscribe(IN_CHANNEL);
    await this.publish({ t: 'start' });
  }

  private onMessage(raw: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      this.onError(`dropped a scoring-in message that isn't JSON: ${raw.slice(0, 200)}`, e);
      return;
    }
    // `JSON.parse` happily returns `null`, an array, a string or a number for valid JSON that
    // isn't the object this protocol always sends (ADR 0020 §1) — `null` in particular reads `t`
    // and `ref` off it without this check exploding (`(null).ref` throws), which is exactly the
    // crash this guards against.
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      this.onError(`dropped a scoring-in message that isn't a JSON object: ${raw.slice(0, 200)}`);
      return;
    }
    const req = parsed as Request;
    const ref = (req as { ref?: unknown }).ref;
    if (typeof ref !== 'string' || !ref) {
      this.onError(`dropped a scoring-in message with no string ref: ${raw.slice(0, 200)}`);
      return;
    }
    const cached = this.replyCache.get(ref);
    if (cached) {
      // A re-send of a request we've already answered: republish the same reply rather than
      // asking KataGo (or even goscorer) again for a judgement already given. This includes a
      // `src:"none"` proposal (no KataGo, or one that crashed/timed out): it is cached and
      // republished as-is too, on purpose — a re-send must get the *same* answer it would have
      // gotten the first time, not a fresh (and possibly different) KataGo judgement.
      this.publish(cached).catch(e => this.onError(`could not republish cached reply for ${ref}`, e));
      return;
    }
    if (this.inFlight.has(ref)) return; // already being worked on; that request will answer it
    this.inFlight.add(ref);
    const run = async (): Promise<void> => {
      let reply: Reply;
      try {
        reply = await handle(req, this.deps);
      } catch (e) {
        this.onError(`handle() threw for ${ref} (a service bug, not a bad request)`, e);
        reply = { t: 'error', ref, message: 'internal error' };
      }
      this.remember(ref, reply);
      this.inFlight.delete(ref);
      try {
        await this.publish(reply);
      } catch (e) {
        this.onError(`could not publish the reply for ${ref}`, e);
      }
    };
    // Only `propose` touches KataGo (ADR 0020 §1: `count` never does), so only `propose` queues
    // behind whatever `propose` is already using the one KataGo process; every other request
    // type runs immediately. Written this way round (checking for `propose`, not `count`) so a
    // future third request type defaults to running immediately rather than silently queuing
    // behind KataGo for no reason.
    if (req.t === 'propose') {
      this.proposeQueue = this.proposeQueue.then(run, run);
    } else {
      void run();
    }
  }

  private remember(ref: string, reply: Reply): void {
    if (this.replyCache.size >= this.cacheSize) {
      const oldest = this.replyCache.keys().next().value;
      if (oldest !== undefined) this.replyCache.delete(oldest);
    }
    this.replyCache.set(ref, reply);
  }

  private publish(reply: Reply | { t: 'start' }): Promise<number> {
    return this.pub.publish(OUT_CHANNEL, JSON.stringify(reply));
  }
}
