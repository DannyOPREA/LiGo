# services/scoring/ in LiGo

The scoring service: KataGo's analysis engine, OGS **goban-engine**'s `autoscore` and
`GobanEngine.computeScore()` (goscorer), on a Redis worker (ADR 0016, ADR 0020 §1, units 4.4-4.5).
How it works: [README.md](README.md).

- **We call goban-engine, we don't rewrite it.** Every board comes from `src/board.ts`'s
  `parseBoard`/`initialState`, never a hand-built `GobanEngine` config; `src/goban.ts` is the only
  file that imports the package (as `libs/board/src/engine.mjs` is for the browser).
- **The service never replays moves.** It always gets the final board and the play-time prisoners
  from lila (ADR 0020 §1); it is never a second rules engine that could disagree with go-rules.
  Test fixtures are the one exception: a couple of libs/conformance's scoring cases give only a
  `handicap` and rely on the standard placement (R-HCP-4), which `test/handicap-points.ts`
  materializes for the harness only, never at runtime.
- **`dead` is always whole chains.** `src/chains.ts` widens a proposal to whole chains before
  counting, and rejects a `count` request whose `dead` isn't already whole chains with an `error`
  reply rather than silently widening it (ADR 0020 §1).
- **Handicap 0/1 never reaches goban-engine's `handicap` field as 1.** `effectiveHandicap` in
  `src/score.ts` clamps it to 0 below 2 stones (R-HCP-2, R-KOMI-3): goban-engine 8.3.226 would
  otherwise give White a free point of compensation for a 1-stone game
  (`test/handicap.test.ts`, `test/conformance.test.ts`'s `ligo-handicap-one-no-compensation-chinese`).
- **A `count` never asks KataGo** (ADR 0020 §1): its `seal` is always empty, since only autoscore's
  ownership-uncertainty heuristic can say a point still needs sealing.
- Truth is `libs/conformance/fixtures/` (only go-rules-expert edits them). Never change a fixture
  to make this package pass; `test/conformance.test.ts` replays every case whose `appliesTo`
  includes `"scoring"` through the `count` path.
- No build step: Node 24 runs `.ts` directly (type stripping), so source stays in **erasable TS
  syntax** only — no `enum`, no `namespace` with runtime code, no parameter properties, no
  decorators. `tsc --noEmit` (`pnpm run typecheck`) is the only check that needs a compiler.
- In lila's pnpm workspace (ADR 0017's reasoning, applied here too: one lockfile, `goban-engine`
  pinned to the exact version `libs/board` uses, so both sides of the wire share one copy of it).
  Add or bump packages from `lila/` with `pnpm --filter @ligo/scoring add --save-exact <pkg>@<version>`;
  the lockfile is `lila/pnpm-lock.yaml`. Third-party runtime dependencies: `goban-engine` and
  `ioredis` (unit 4.5, logs/decisions.md: node-redis's own alternative was passed over for
  ioredis's automatic resubscribe of `scoring-in` after a reconnect); `typescript`/`@types/node`
  are dev-only.
- **The Redis worker** (`src/worker.ts`, unit 4.5, ADR 0020 §1): the two channels (`scoring-in`
  lila → service, `scoring-out` service → lila), each message one JSON object, `{"t":"start"}`
  announced once on boot so lila re-sends whatever it was waiting on. It never has its own
  opinions about scoring — it only routes `handle()`'s replies onto Redis — but three things live
  here rather than in `handle()` (logs/decisions.md has the reasoning):
  - **Concurrency**: `count` never asks KataGo (`handle()`'s own rule), so it runs as soon as it
    arrives, however many are in flight; `propose` queries the one KataGo process this service
    runs, so a second `propose` queues behind the first (FIFO) rather than racing it for the same
    CPU/GPU.
  - **Dedup of re-sent requests** (lila resends the latest unanswered request of a game on
    `start`, when its round loads, and every 30s while one is outstanding, ADR 0020 §1): a bounded
    LRU-ish cache of `ref` → reply. A re-sent `ref` gets the cached reply republished, not
    recomputed (safe even for `propose`, since it's the same board either way); a `ref` still
    in-flight is dropped, since the request already running will answer it.
  - **A game never stays without a proposal**: `handle()` itself never throws for a
    request-shaped failure, and `KataGoClient` falls back to `src:"none"` on its own crash or
    timeout and respawns lazily on the next query (`src/katago.ts`); the one thing `worker.ts`
    guards is a `handle()` bug (a real throw) — caught, logged, turned into an `error` reply, so a
    single bad request never leaves a game silent or takes the process down.
  `src/main.ts` is the actual entry point (env vars, the two ioredis connections, signal
  handling); `worker.ts` itself knows nothing about ioredis specifically (`Publisher`/`Subscriber`
  are the narrow slice of its interface it needs), so `test/worker.test.ts` drives it with an
  in-process fake pub/sub. Supervision: `dev/ligo up`/`down`/`status`/`logs scoring` in native
  mode (`dev/ligo`'s `native_scoring_worker_up`/`_down`, a small restart-loop supervisor —
  `start_bg_restart`, capped exponential backoff — rather than the generic `start_bg` lila/lila-ws
  use, since `start_bg`'s `tail -f /dev/null |` wrapper keeps its recorded pid alive even after a
  plain Node worker under it has died); docker mode runs it too, as `dev/lila-docker/compose.yml`'s
  `scoring` service (the `ui` container's Node image, `:z`-mounted binds), but with no
  `KATAGO_BIN`/`KATAGO_MODEL`/`KATAGO_CONFIG` set at all — no container has KataGo yet (no OpenCL
  passthrough to the owner's GPU, no binary staged into an image) — so every `propose` there
  answers `src:"none"` (ADR 0020 §4's own fallback), same as native mode with no KataGo installed
  (unit 4.5 review, logs/decisions.md).
- Bumping `goban-engine`: change the exact version in `package.json` (from `lila/`, as above),
  keeping step with `libs/board`'s version (both packages must pin the same one), check its engine
  changes (upstream-scout), keep `NOTICE.md`/`test/autoscore_test_files/NOTICE.md` and COPYING.md
  in step, run `dev/ligo test scoring`. A version bump is a dependency change.

## Test
`dev/ligo test scoring` (native mode: typecheck, lint, then `pnpm --filter @ligo/scoring run test`).
Runs OGS's 31 autoscore regression games (`test/autoscore.test.ts`, must be 31/31), the
libs/conformance scoring fixtures (`test/conformance.test.ts`), board/chain/handicap unit tests,
the KataGo client against a fake `katago` process (`test/katago.test.ts`: fallback, timeout,
crash-and-restart), the Redis worker against an in-process fake pub/sub
(`test/worker.test.ts`: dedup, propose/count concurrency, a `handle()` bug becoming an `error`
reply), a real Redis round trip (`test/worker-redis.test.ts`: starts its own `redis-server` on a
free port, skipped — not failed — when `redis-server` isn't on PATH), and, only when
`KATAGO_BIN`/`KATAGO_TEST_NET` are set (as `dev/ligo katago env` prints them), one real-KataGo test
(`test/integration.test.ts`; otherwise skipped, not failed). Docker mode: the test suite itself is
still skipped there (no KataGo in the `ui` container), but `dev/ligo up`/`down`/`status`/
`logs scoring` DO start a live worker there now — see the "Redis worker" note above — it just
always answers `src:"none"`. CI: the `scoring` job in `.github/workflows/scoring.yml` installs
`redis-server` so the round trip runs there too (`LIGO_REQUIRE_REDIS=1` turns a missing binary
into a failure, not a skip).

## Benchmark
`dev/ligo scoring bench` (`src/bench.ts`, unit 4.6) grades autoscore's raw `result`/`needs_sealing`
(and `sealed_result`) with `src/grade.ts`'s `matchesOwnership` rule, shared with
`test/autoscore.test.ts`; never grade `countGiven`'s `owner` against `correct_ownership` (goscorer
marks only territory under Japanese rules). Runs the set `--runs` times; the gate is total correct /
total game-runs. It needs a real KataGo and the network `dev/katago.sh env` picks (`KATAGO_NET`; an
unpinned b18 falls back to the test network). Cloud numbers are smoke figures; the >= 97% gate is
the owner's, on his GPU.

## Logs to read
`logs/scoring.md` (Lessons + latest entries).
