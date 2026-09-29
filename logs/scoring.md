# Scoring log

## Lessons (curated, ≤ 30 lines — read this first)
- OGS autoscore uses TWO KataGo ownership maps (black to move and white to move); it removes stones above 0.7 ownership and flags points below 0.3 as needing sealing (2026-09-25, planning research).
- goscorer (MIT, lightvector) does territory/area counting with seki detection once dead stones are marked, and is bundled in goban (2026-09-25, planning research).
- KataGo on CPU (Eigen) manages ~10–20 playouts/s with small nets: fine for scoring tests, not for review. The AMD GPU uses the OpenCL backend (2026-09-25, planning research).
- Measured: KataGo v1.18.1 Eigen with the b6 test net does ~140 visits/s on the 4 cloud vCPUs (4 threads); the planning estimate above was for full-size nets (2026-09-27, unit 0.5).
- goban's `test/autoscore_test_files/` (31 OGS games with ownership maps and expected results) is a ready-made regression set for autoscore; its expected results were drafted from the same maps, so it is not an accuracy benchmark (2026-09-27, unit 1.3).
- KataGo's multi-threaded search is not deterministic: store the proposal shown to players, recount only with goscorer (2026-09-27, unit 1.3).
- KataGo's analysis engine accepts a location as `"(x,y)"` with explicit integer coordinates (its docs plus `cpp/game/board.cpp`'s `Location::getLoc`/`getX`/`getY`): y increases top-to-bottom, the same row-major order as its `ownership` reply and as our own board matrix, so no coordinate flip is needed when building `initialStones` (2026-09-28, unit 4.4).
- goban-engine 8.3.226's Chinese `getHandicapPointAdjustmentForWhite` returns the raw handicap count with no AGA "-1" step, so `handicap: 1` gives White 1 point of compensation R-HCP-2 forbids; a service (or anything else calling `computeScore`) must clamp handicap below 2 to 0 itself, never trust the field as given (2026-09-28, unit 4.4).
- `autoscore`'s "needs sealing" list only exists because of KataGo's ownership-uncertainty threshold; a `count` recount (goscorer only, no KataGo) has no way to compute it, so its `seal` is always empty — the ADR 0020 example's "same fields without src" is imprecise on this point (2026-09-28, unit 4.4).
- `api.github.com`, `github.com` and `codeload.github.com` are blocked in this cloud session's proxy allowlist, but `raw.githubusercontent.com` and a plain `git clone https://github.com/...` both work; vendoring files from a public GitHub repo goes through `git clone`, not the GitHub API (2026-09-28, unit 4.4).
- goban-engine's `autoscore` mutates the board it's given (it blanks the dead stones it finds in place); always pass a copy, never the board a later widen/count step still needs (2026-09-28, unit 4.4 review fixes).
- Probe every pub/sub listener with `null`, `[]` and a bare number, not just "not JSON": all three
  parse as valid JSON but aren't the object shape a handler assumes, and `EventEmitter`/ioredis
  don't catch a listener's throw — an uncaught one takes the whole process down (2026-09-28, unit
  4.5 review fixes).
- Grade autoscore's raw `result`/`needs_sealing` (as `src/grade.ts` does), never goscorer's `owner`, against OGS's `correct_ownership`: under Japanese rules `owner` marks territory only, so a correct answer would fail by construction (2026-09-29, unit 4.6).

## Entries (newest first)
### 2026-09-29 · unit 4.6 · autoscore benchmark and the b18 network pin
- Did: `dev/ligo scoring bench [--net PATH] [--games DIR] [--gate N] [--runs N] [--limit N]
  [--timeout MS]` (`services/scoring/src/bench.ts`, grading in `src/grade.ts`). For each of OGS's
  31 autoscore games (Apache-2.0, already vendored, so COPYING.md needs nothing new) it asks a real
  KataGo for the two ownership maps, runs `autoscore`, and grades its raw `result`,
  `needs_sealing` and `sealed_result` against the file, with the pass rule of
  `test/autoscore.test.ts` (moved into `src/grade.ts`, used by both, including the reverse
  "flagged points must be 's' or '*'" check). Secondary, never gated: whether the widened dead set
  agrees with the file's stones. Runs the set `--runs N` times (default 3); the gate is total
  correct / total game-runs >= `--gate` (97% of 93 allows 2 misses); non-zero exit only with
  `--gate`. Report in `.ligo/scoring-bench/report.json`. A unit test grades OGS's stored maps with
  the same grader and expects 31/31. `dev/katago.sh`: `env` also prints `KATAGO_NET`; `net_path`
  refuses an unverified b18 (test network, stderr warning; `LIGO_KATAGO_ALLOW_UNVERIFIED=1`
  overrides); install re-checks a present b18 against `NET_SHA256` once pinned; the pin only
  applies to the pinned network name, a `LIGO_KATAGO_NET` override is always unverified.
- Honest limits of the set: it is autoscore's own regression set. OGS tuned autoscore against it,
  8 of the 31 are synthetic corner/dev tests, and the expected results were corrected by hand, not
  agreed by the players, so the figure leans optimistic and the plan row's "games with agreed
  results" is only partly met. A larger set of real finished games is a follow-up. Komi is 7.5
  (files carry none; the unit 1.3 spike used it).
- Worked: reusing the vendored set and OGS's own pass rule.
- Didn't work: a first grader compared `countGiven`'s goscorer `owner` (and the seal list after
  dead chains were removed) with `correct_ownership`. Under Japanese rules `owner` marks territory
  only, not living stones, so even OGS's stored maps scored 29/31 (game_35115094,
  game_seki_64848549) by construction; the review caught it. An earlier attempt compared the board
  with dead stones blanked and failed 31/31. pnpm 12 forwards a literal `--` to the script, so
  `parseArgs` skips a bare `--`.
- Lessons: grade autoscore's raw `result`/`needs_sealing`, never goscorer's `owner`, against
  `correct_ownership` (2026-09-29, unit 4.6).
- Decisions: two lines in logs/decisions.md (2026-09-29): the set and grading, and the gate over
  `--runs`. Unverified b18 is refused (safer than warning). No self-play set. No CI job: the bench
  takes minutes on CPU, so it stays a `dev/ligo` command.
- Pending on the owner: the b18 sha256 (katagotraining.org and web.archive.org are blocked from the
  cloud) and the network's licence text (PLAN §9); the >= 97% gate on his GPU.
- Cloud smoke figure: `dev/ligo scoring bench --runs 1` with the b6 test network on 4 Eigen CPU vCPUs: 28/31 (90.3%, 113 s); failing: game_33822914, game_beta_17150, game_seki_64848549; dead-set agreement 29/31 (secondary). Not deterministic (earlier, differently graded runs gave 27 and 28), and NOT the gate. `dev/ligo test scoring`: 122 tests, 0 fail (bench/grade tests included).

### 2026-09-28 · unit 4.5 review fixes · a null-message crash, docker mode's worker, a restart loop
- Did (review of the entry below, all under the owner's 2026-09-28 delegation): fixed a real
  crash — `JSON.parse('null')`, `JSON.parse('[]')` and `JSON.parse('5')` all succeed (valid JSON),
  but reading `.ref` off `null`/an array/a number used to throw synchronously inside ioredis's
  `emit('message')`, an uncaught exception that killed the whole process (reproduced with
  `redis-cli publish scoring-in null` against the real worker, and again here via `git stash` on
  the pre-fix code). `worker.ts`'s `onMessage` now checks the parsed value is a non-null,
  non-array object before treating it as a `Request`; the `listener` wrapper around it also gained
  a try/catch → `onError`, so no future bug in `onMessage` itself can reach ioredis either.
  `test/worker.test.ts` gained a test sending `'null'`, `'[]'` and `'5'` through the real listener
  function and asserting it doesn't throw, then that the worker still answers a normal `count`
  afterwards. Docker mode (Claude's decision after a reviewer finding): `dev/lila-docker/compose.yml` gained a
  `scoring` service (the `ui` container's Node image/pattern, `:z`-mounted `lila`/`libs`/`services`
  for pnpm workspace resolution, no `profiles:` so it starts by default) running the worker with no
  `KATAGO_BIN`/`KATAGO_MODEL`/`KATAGO_CONFIG` at all, so every `propose` answers `src:"none"` (ADR
  0020 §4's own fallback) until a later unit gives docker mode a real KataGo story; `dev/ligo`'s
  docker branches for `up`/`down`/`status`/`logs scoring` now treat it like any other compose
  service instead of refusing it, and the "honest skip" wording describing docker mode is replaced
  in `dev/ligo`, `services/scoring/CLAUDE.md` and `services/scoring/README.md`. Native mode's
  supervision changed from the generic `start_bg` (its `tail -f /dev/null |` wrapper, needed to
  keep stdin open for Play, has the side effect of keeping the recorded pid alive even after a
  plain Node worker under it dies, so `dev/ligo status` kept saying "running" for a dead worker) to
  a new `start_bg_restart`: a small supervisor loop that restarts the worker with capped
  exponential backoff (1s, 2s, 4s, ... capped at 30s) and records its own pid, so `status` reflects
  a live supervisor that keeps the worker coming back rather than a dead-but-still-running wrapper.
  `main.ts` also: logs `SCORING_REDIS_URL` with any credentials stripped (`redactedUrl`, `new URL`
  parse-and-blank, never logs the raw string); calls `process.exit(1)` on a `main()` rejection
  instead of only setting `process.exitCode`, since an open ioredis connection can otherwise keep
  the event loop alive forever half-started. `worker.ts`'s propose/count branch is now written as
  "if `propose`, queue; else run immediately" (was the other way round), so a future third request
  type defaults to running immediately rather than silently queuing behind KataGo for no reason;
  the reply-cache comment now notes a cached `src:"none"` reply is intentional, so a re-send gets
  the same answer rather than a fresh (and possibly different) `src:"none"` recompute.
  `test/worker-redis.test.ts` actually sends `propose` then `count` now (it only sent `count`
  before, despite its name), clears its 5s startup timer on success instead of leaking it, and
  `.github/workflows/scoring.yml` gained `LIGO_REQUIRE_REDIS: '1'` (same pattern as
  `LIGO_REQUIRE_KATAGO`) so CI fails loudly instead of silently skipping if `redis-server` is ever
  missing from the runner.
- Worked: reproducing the crash first (via `git stash` back to the pre-fix `worker.ts`) confirmed
  the exact failure (`TypeError: Cannot read properties of null (reading 'ref')` at
  `worker.ts:106`) before fixing it, and confirmed the new test genuinely failed on the old code.
  The restart loop was verified without a full `dev/ligo up` — sourcing `dev/ligo`'s functions
  directly (`tail -n +1 dev/ligo | sed '$d'`, with `ROOT`/`LILA`/`WS`/`STATE`/`LD` re-set and
  `need_node_modules` stubbed) against a real `dev/ligo db` let `native_scoring_worker_up`/`_down`
  and the real `dev/ligo status`/`logs` be exercised in isolation; crash-killing the supervised
  child confirmed the loop respawns it and reconnects to Redis, and `native_scoring_worker_down`
  leaves no orphan `node src/main.ts` process (`pgrep -af` after, clean). The compose file was
  validated with a real `docker compose -f compose.yml config` (a Docker daemon was unexpectedly
  available in this session, Engine 29.3.1 / Compose v5.1.1): the resolved default service set is
  `caddy, lila, lila_ws, mongodb, mongodb_secondary, redis, scoring` (the profiled `ui`/
  `mongo_express` correctly excluded), and the `:z` mounts and env resolved as written. **This
  entry corrects the test-count claim in the entry below**: that entry's "Verified by Claude" line
  understated the real count; `dev/ligo test scoring` (KataGo env loaded) passes **112/112** here,
  including this review's new test. **`dev/ligo up`/`down` were exercised via the supervision
  functions directly (`native_scoring_worker_up`/`_down`, `stop_bg`/`start_bg_restart`), not via a
  full `dev/ligo up`**, for both this review and the entry below.
- Didn't work / dead ends: none new this pass.
- Lessons: (see Lessons above — the null/`[]`/number lesson was promoted from this unit)
- Decisions: docker mode getting a real `scoring` worker (no KataGo env, `src:"none"` always) is
  recorded as a new row in logs/decisions.md, dated 2026-09-28, above the earlier "honest skip"
  row (left as written, since it was correct when made).
- Verified by Claude: `dev/ligo test scoring` 112/112 (KataGo env loaded via
  `dev/ligo katago env`); `bash dev/tests/run.sh`; `bash .claude/skills/verify/verify.sh`;
  `shellcheck dev/ligo` clean; a real `node src/main.ts` against a real `redis-server`, then
  `redis-cli publish scoring-in null` (and `[]`, `5`) — the process logged
  "dropped a scoring-in message..." for each and kept answering afterward, did not crash;
  `docker compose config` on the edited `compose.yml`. Needs owner verification: an actual
  `dev/ligo up`/`down` end-to-end in **docker mode** (this session has a daemon but not the owner's
  full stack — Caddy TLS, the owner's `.env`, etc. — so `docker compose config` is as far as this
  session could check it); the OpenCL/GPU path is still untouched by this unit either way.
- Follow-ups: none.

### 2026-09-28 · unit 4.5 · services/scoring on Redis: the worker, supervision, a round-trip test
- Did: `src/worker.ts` (`Worker`), the Redis-shaped wiring around unit 4.4's `handle()` (ADR 0020
  §1): subscribes `scoring-in`, publishes replies to `scoring-out`, sends `{"t":"start"}` once on
  boot. Concurrency: `count` never asks KataGo, so it runs as soon as it arrives, however many are
  in flight; `propose` queues FIFO behind the one KataGo process this service runs. Dedup: a
  bounded LRU-ish cache of `ref` → reply — a re-sent `ref` (lila resends its latest unanswered
  request on `start`, on round load, and every 30s while one is outstanding) gets the cached reply
  republished, not recomputed; a `ref` still in flight is dropped, since the request already
  running will answer it. A `handle()` throw (a service bug, not a bad request) is caught, logged
  and turned into an `error` reply rather than left silent or crashing the process. `worker.ts`
  itself knows nothing about a specific Redis client (`Publisher`/`Subscriber` are the narrow slice
  of ioredis's interface it needs); `src/main.ts` is the real entry point (env vars, two ioredis
  connections — `subscribe` puts a connection into subscriber mode, so `pub`/`sub` must be
  separate, as fishnet's own Redis client was — SIGTERM/SIGINT shutdown). `dev/ligo` gained
  `native_scoring_worker_up`/`_down` (background process via `start_bg`/`stop_bg`, exactly like
  lila/lila-ws, KataGo env loaded best-effort from `dev/ligo katago env`), wired into
  `up`/`down`/`status`/`logs scoring`; docker mode starts nothing (no KataGo in any container yet,
  same honest skip `docker_scoring` already made for tests). Tests: `test/worker.test.ts` (dedup,
  propose/count concurrency ordering, the `handle()`-throw guard, malformed messages) against an
  in-process fake pub/sub; `test/worker-redis.test.ts`, a real round trip — starts its own
  `redis-server` on a free port, skipped (not failed) when the binary isn't on PATH; CI
  (`.github/workflows/scoring.yml`) now installs `redis-server` so that test runs there too. Added
  `ioredis` 6.0.0 (MIT) to `services/scoring/package.json` via
  `pnpm --filter @ligo/scoring add --save-exact`; COPYING.md, NOTICE.md, README.md, CLAUDE.md
  updated for it and its runtime transitive dependencies.
- Worked: ioredis's automatic reconnect and automatic re-subscription of `scoring-in` after a
  reconnect meant `main.ts` needed no reconnect logic of its own, only logging the transitions;
  `KataGoClient`'s existing lazy respawn-after-crash (unit 4.4) needed no changes for the worker to
  reuse — a crash mid-`propose` already falls back to `src:"none"` and the client is ready again on
  the next query. Manual end-to-end smoke test (real `redis-server`, real KataGo test network,
  `node src/main.ts`) round-tripped a `propose` and produced a `src:"katago"` proposal; `dev/ligo
  up`/`down`/`status`/`logs scoring` were exercised directly (via `dev/ligo db` plus the
  supervision functions) and correctly started, reported and stopped the worker.
- Didn't work / dead ends: erasable-TS-syntax again caught out constructor parameter properties
  (`constructor(private readonly pub: Publisher, ...)`), same as noted for unit 4.4's classes —
  written out as plain field assignments instead. ioredis's own `subscribe` type is a rest-parameter
  overload (`...channels, callback?`) that doesn't structurally match a plain
  `(channel: string) => Promise<number>`, so `Subscriber` needed a tiny adapter in `main.ts` (and in
  the round-trip test) rather than passing an ioredis connection straight through. `oxlint`'s
  `golden(no-unknown-returns)` rejected `Promise<unknown>` on the `Publisher`/`Subscriber` interface
  methods; both got concrete return types (`Promise<number>`) matching what ioredis's `publish`/
  `subscribe` actually resolve with. Running `dev/ligo deps` after `pnpm --filter @ligo/scoring add`
  had already left an uncommitted `pnpm-lock.yaml` diff tripped `ab_stub_install`'s
  `git diff --quiet` restore-check (it assumes a clean lockfile going in); the install itself
  completed correctly and the lockfile content was fine — the check's false positive is a
  pre-existing quirk of running `deps` with other legitimate lockfile changes already staged, not
  something this unit introduced or needed to fix.
- Lessons: (see Lessons above — none promoted this unit)
- Decisions: the Redis client and its reconnect/concurrency/dedup design, and native-vs-docker
  supervision, Claude's call under the owner's 2026-09-28 delegation (logs/decisions.md).
- Verified by Claude: `dev/ligo test scoring` with the real KataGo test network (91/91, including
  the real-KataGo integration test and both worker test files); `dev/tests/run.sh` (50/50);
  `bash .claude/skills/verify/verify.sh` (all 9 gates pass, including `ui tests (vitest)` and
  `go-rules + board` which this unit's `dev/ligo` edit pulled into scope); `pnpm install
  --frozen-lockfile` from `lila/` after the `ioredis` add; `pnpm licenses list --filter
  @ligo/scoring` through `dev/ci/meta_checks.py js-licences` (15 packages, 2 licences, all
  AGPL-compatible); `shellcheck dev/ligo` clean; manual end-to-end smoke test described above;
  `dev/ligo up`/`down`/`status`/`logs scoring` supervision exercised directly against a real
  `dev/ligo db`. Skipped tests never counted as passing: the real-KataGo test and the Redis
  round-trip test both ran for real (KataGo and redis-server were installed/available), not
  skipped, in this verification. · Needs owner verification: none beyond the two decisions above
  if they should be revisited; the owner's own OpenCL/GPU box was not used (cloud session, CPU
  KataGo only).
- Follow-ups: unit 4.6 adds the accuracy benchmark and full-size network (the worker's `propose`
  path would then use it in production, still via `dev/ligo katago env`'s conventions); units
  4.7+ build lila's own side of the wire (a real `scoring-in`/`scoring-out` consumer) and a docker
  story for KataGo (OpenCL passthrough or a CPU fallback container) would let docker mode start
  the worker too.

### 2026-09-28 · unit 4.4 review fixes · 4.4 review fixes
- Did: fixed four blocking review findings on unit 4.4 (32402dd) and several non-blocking ones, on
  top of the unit rather than amending it. B1: `proposeFromOwnership` (`src/score.ts`) now calls
  `autoscore` on a copy of the board (`board.map(row => row.slice())`), since goban-engine's
  `autoscore` mutates the board it's given (blanks the dead stones it finds in place) — the
  original code passed it the same array `widenToChains` and `countGiven` then read, so every
  proposal came back `dead: []`. B2: `countGiven` only adds lila's play-time prisoners under
  Japanese rules now (R-SCORE-J1); Chinese rules never did (R-SCORE-C1), but the original code
  added them regardless. B3: `KataGoClient.start()` now listens for `proc.stdin`'s own `'error'`
  event (`die(...)`), since a KataGo that exits immediately (e.g. a bad binary) closes its stdin
  and an unhandled EPIPE on that stream crashes the whole Node process even though the write
  callback already rejects the one pending request. B4: `src/handle.ts` gained
  `validateRequest`, checked before `parseBoard`, covering `t`, `size`, `rules`, `komi`,
  `handicap`, `prisoners.{b,w}`, `dead` (for `count`) and `ref`; `src/board.ts`'s `parseRow` now
  rejects uppercase `B`/`W` (ADR 0019 §6 is lowercase only), a run with a leading zero, and a run
  longer than the board (checked before it's expanded into cells, so a malformed run can't inflate
  a small `size` into a huge allocation). Non-blocking: `KataGoClient.onLine` ignores a `warning`
  line that carries no `ownership` instead of treating it as the reply; a request that times out
  now kills the process (`die`) instead of leaving a hung KataGo running for the next request;
  `dev/ligo`'s `native_scoring` loads `dev/katago.sh env` when KataGo is installed, so
  `test/integration.test.ts`'s real-KataGo test runs instead of skipping; `scoring.yml` sets
  `LIGO_REQUIRE_KATAGO=1`, which makes that test's module throw (failing the whole run) instead of
  skip when KataGo isn't there; KataGo's `logDir` override is now a fresh `mkdtemp` directory per
  spawn instead of one fixed shared path. Every fix has a test that fails on 32402dd and passes
  after (`test/score.test.ts` is new; the rest are additions to the existing suites).
- Worked: reproducing each bug for real before writing the fix (a small standalone script for the
  EPIPE crash, since it raced timing inside `node --test`; running `autoscore` directly against a
  vendored OGS game and diffing the board before/after for B1) made the fix and the test obvious,
  and confirmed the review's descriptions were accurate.
- Didn't work / dead ends: the EPIPE crash (B3) didn't reproduce reliably inside `node --test`
  itself (timing-dependent: `proc.on('exit', ...)` sometimes rejected the pending request before
  the stray stdin `'error'` event fired) — confirmed instead with a standalone script run outside
  the test runner, which crashed the whole Node process every time without the fix and never with
  it; the katago.test.ts case for it is kept as a regression test even though it doesn't reliably
  fail pre-fix in-process.
- Lessons: see the Lessons section (goban-engine autoscore/copy).
- Decisions: none needed asking the owner; all four blocking findings and the non-blocking ones
  were mechanical fixes within the unit's existing design (ADR 0020 §1, ADR 0019 §6). Checked
  whether a Chinese scoring fixture with nonzero captures exists in `libs/conformance/fixtures/`
  for B2 (only go-rules-expert may add one): none of the "scoring" fixtures give nonzero
  `expect.captures` under Chinese rules, so `test/score.test.ts` covers B2 directly against a
  vendored game instead; flagging this so go-rules-expert can add one if the owner wants fixture
  coverage of it too.
- Why the 82 tests missed these: B1 (autoscore mutating its input) had no test that checked the
  board was unchanged after a call, or that a `dead` proposal was actually non-empty on a game
  known to have dead stones — `test/autoscore.test.ts` calls `autoscore` directly on data loaded
  fresh from each file, so it never noticed the mutation, and no test then chained `autoscore`'s
  output back through `widenToChains`/`countGiven` the way `proposeFromOwnership` does. B2 had no
  Chinese-rules test with nonzero play prisoners (`test/handicap.test.ts`'s Chinese cases all use
  `{b:0,w:0}`). B3 had no test that started a process built to die immediately and then wrote to
  its stdin — the existing `EXIT_AFTER: '0'` case exits the fake *script* before the client even
  spawns a real child in some code paths, and the real crash needs a big-enough write plus the
  process already gone, which `/bin/true` on a 19x19 board reproduces but the smaller cases didn't.
  B4: `handle` had no test at all with a malformed request shape (wrong types, out-of-range
  numbers, a missing field) — every existing test used a well-formed `ProposeRequest`/
  `CountRequest`. Separately, the earlier "`dev/ligo test scoring` (82/82, including the real
  KataGo test network via `dev/ligo katago install cpu`)" line in the entry below was wrong:
  `dev/ligo`'s `native_scoring` never exported `KATAGO_BIN`/`KATAGO_TEST_NET`
  (`dev/katago.sh env`), so `test/integration.test.ts` was always skipped, not passing, in that
  run and in CI (`scoring.yml` did export them, so CI's own run of that test was genuine — but the
  log entry's claim was about `dev/ligo test scoring`, which didn't). Also: ADR 0020 §4's
  goban-pure-JS-estimator fallback (for when KataGo itself is unavailable) was never tried in unit
  4.4 — the fallback actually shipped is `noneDead` (nothing marked dead), not that estimator.
- Verified by Claude: `dev/ligo test scoring` 102/102, 0 skipped (KataGo env loaded via
  `dev/ligo katago env`, including the real-KataGo integration test and its new dead-stone
  assertion); every new/changed test confirmed to fail on 32402dd and pass after (real command
  output, not narrated); `bash dev/tests/run.sh` 50/50; `bats .claude/hooks/tests` 48/48;
  `.claude/skills/verify/verify.sh` all gates pass, including its `scoring` gate running the real
  KataGo test (0 skipped, checked in its log); `shellcheck dev/ligo` clean;
  `pnpm --filter @ligo/scoring run typecheck`/`lint` clean. · Needs owner verification: none beyond
  the standing item below.
- Follow-ups: ask go-rules-expert (with the owner's approval) whether to add a Chinese scoring
  fixture with nonzero play captures to `libs/conformance/fixtures/`, since none exists today
  (B2's decision above).

### 2026-09-28 · unit 4.4 · services/scoring core: KataGo client, autoscore, goscorer
- Did: `services/scoring`, a member of lila's pnpm workspace (ADR 0017's reasoning, applied here:
  one lockfile, `goban-engine` pinned to the same 8.3.226 as `libs/board`). `src/goban.ts` wraps
  the CJS default export; `src/board.ts` parses/formats the compact board string (ADR 0019 §6) and
  SGF points; `src/chains.ts` widens dead points to whole chains and checks a given set already is
  one; `src/katago.ts` is a `KataGoClient` for one long-running `katago analysis` process
  (JSON-lines, a 30s per-request timeout, restart after a crash); `src/score.ts` runs `autoscore`
  and `GobanEngine.computeScore()` and builds the ADR 0020 `score`/`owner` reply, clamping handicap
  below 2 to 0; `src/handle.ts` is `handle(message) -> reply` (`propose` falling back to
  `src:"none"`, `count` rejecting non-whole-chain dead stones as an `error`); `src/cli.ts` reads one
  JSON request on stdin. No Redis (unit 4.5). Vendored OGS's 31 autoscore test games
  (`test/autoscore_test_files/`, goban commit e61c56e2) with their Apache-2.0 notice. Added
  `dev/ligo test scoring` (native; docker: "not yet", no KataGo in its containers until unit 4.5),
  a `scoring` area in `dev/ci/changed.sh` (also covers `libs/conformance/fixtures/`, the lockfile,
  and `dev/katago.sh`, updating `dev/tests/run.sh`'s exact-output checks to match) and a `scoring`
  CI job (`.github/workflows/scoring.yml`, KataGo CPU test network only). COPYING.md, NOTICE.md,
  CLAUDE.md and README.md for the new package; root CLAUDE.md's repo map moved it out of "planned".
- Worked: `autoscore` and `GobanEngine.computeScore()` needed nothing beyond a board matrix, two
  ownership maps and a dead-stone list — no wrapper logic around goscorer itself, exactly what the
  build-vs-buy memo found; `computeScore().{black,white}.scoring_positions` already gives the owner
  string's points (encoded the same way as `dead`/`seal`), so no second call to goscorer's
  territory/area functions was needed for that.
- Didn't work / dead ends: `github.com`/`api.github.com`/`codeload.github.com` are blocked in this
  cloud session, so the GitHub API couldn't list `goban`'s test directory; a plain `git clone`
  worked instead (see Lessons). A fake KataGo process exiting right after writing its last response
  raced the parent's pipe read in one test until the fake script waited briefly before exiting.
- Decisions (Claude, under the owner's 2026-09-28 delegation):
  - A `count` reply's `seal` is always empty (see Lessons); `sc.sl` (unit 4.8) keeps showing the
    original proposal's seal points across toggles.
  - The compact board string's empty-run count is the plain decimal number, not limited to one
    digit (ADR 0019/0020 leave the exact encoding open beyond "a number"; a 19-wide board can have
    a run longer than 9). Flagging this for whoever builds the lila side (units 4.7+) to match.
  - `ligo-handicap-one-no-compensation-chinese`, the 1-stone-handicap scoring fixture unit 4.4 was
    asked to add, was already present in `libs/conformance/fixtures/ligo.json` (presumably added
    ahead of this unit by go-rules-expert); no new fixture PR is needed, only this package's own
    `test/handicap.test.ts` unit tests, which also cover it directly.
- Verified by Claude: `dev/ligo test scoring` (82/82, including the real KataGo test network via
  `dev/ligo katago install cpu`); OGS's 31 autoscore games 31/31 on stored ownership maps; all 18
  libs/conformance scoring fixtures pass through the `count` path; `dev/tests/run.sh` 50/50 after
  updating its `changed.sh` expectations; `pnpm --filter @ligo/scoring run typecheck`/`lint` clean;
  `verify.sh` (see this unit's PR). · Needs owner verification: none beyond the two decisions above
  if they should be revisited.
- Follow-ups: unit 4.5 adds the Redis worker, recounts on crash/restart, and `dev/ligo up/down`
  supervision (including in docker mode, which unit 4.4 leaves unwired for scoring); unit 4.6 adds
  the accuracy benchmark and full-size network.
### 2026-09-28 · unit 4.1 · ADR 0020: scoring phase, service protocol, byo-yomi in lila
- Did: wrote ADR 0020: Redis pub/sub messages between lila and `services/scoring` (final board +
  go-rules' prisoners, replies matched by `ref`), the `sc` block on `game5`, the scoring-phase state
  machine with versioned toggles and accepts, timeouts (3 min live, 1 day correspondence), clocks
  stopped during the phase, the no-KataGo and no-service fallbacks, `VariantEnd` for scored games,
  and byo-yomi's `cy` key and clock payload.
- Worked: fishnet's Redis pattern (two channels, re-send on `start`) fits; lila-ws forwards the new
  commands with no Go knowledge (`r/do`).
- Didn't work / dead ends: the first draft missed five things the reviewer found: lila's
  `outoftime` counts a stopped clock as flagged, re-send on `start` only reaches loaded rounds and
  deadlines didn't survive a lila restart, accept could land on an unseen count, widening dead
  stones in lila made the stored count stale, and goban-engine gives 1 point of compensation for
  handicap 1. All fixed in the ADR (outoftime off while `sc` exists, `ck`/`ex` + Titivate, count
  version `v`, the service returns whole chains, handicap 0 for `hc` < 2).
- Lessons: a pause in lila's round needs checking against every out-of-time path (client flag,
  Titivate), and any deadline must live in Mongo (`ck`), not only in the round actor.
- Decisions: all of ADR 0020, Claude's call under the owner's 2026-09-28 delegation
  (logs/decisions.md).
- Verified by Claude: verify.sh; reviewer agent (5 blocking findings, fixed); KataGo accepts komi
  from -400 to 400 in half points (reviewer's run). · Needs owner verification: none beyond reading
  the ADR if curious.
- Follow-ups: 4.3 records the two spec additions; 4.4 adds a 1-stone-handicap scoring fixture.
### 2026-09-28 · Phase 4 breakdown · Go-native game split into units 4.1–4.12
- Did: split Phase 4 into 12 units (docs/PLAN.md §5, "Phase 4 units"): a design ADR (4.1), then the
  go-rules byo-yomi clock (4.2) and scoring phase (4.3), `services/scoring` core (4.4) and on Redis
  (4.5), the autoscore benchmark and full-size network (4.6), and the lila halves (4.7–4.11) and the
  demo (4.12), which need Phase 3's round, game creation and round UI.
- Worked: ADRs 0016 and 0019 already fix most of the shape; their open points (message format,
  prisoners, fallback, network licence, "scored" status, byo-yomi storage) all land in 4.1 or 4.6.
- Didn't work / dead ends: none.
- Lessons: splitting each feature into a library half (go-rules, the Node service) and a lila half
  lets a phase start while the lila fork is still being de-chessed.
- Decisions: the split itself, Claude's call under the owner's 2026-09-28 delegation
  (logs/decisions.md).
- Verified by Claude: verify.sh. · Needs owner verification: whether the split reads right.
- Follow-ups: 4.1 next.
### 2026-09-28 · unit 1.3 / PR #11 · Scoring decision recorded
- Did: adopted option A (Node `services/scoring` with KataGo + goban-engine autoscore + goscorer)
  as ADR 0016, after the owner delegated every decision on 2026-09-28 ("Don't ask for my approval
  for anything, just work until I tell you to stop"); merged main first.
- Worked: CI green on the memo PR before the decision (9/9 checks).
- Didn't work / dead ends: none.
- Lessons: ADR numbers race between parallel units (1.4 took 0013, 1.2 merged 0014 and another
  change took 0015 while this PR was open, so this ADR became 0016); re-check the number right
  before merging.
- Decisions: 1.3 → A, Claude's call under the delegation (logs/decisions.md, ADR 0016).
- Verified by Claude: verify.sh, CI. · Needs owner verification: whether he agrees with A (revisit
  by a superseding ADR); the katagotraining.org network licence before Phase 4 pins one.
- Follow-ups: Phase 4 builds the service and decides its message format and fallback.
### 2026-09-27 · unit 1.3 · Build-vs-buy memo for scoring
- Did: spike of the plan's pipeline (KataGo analysis engine → goban-engine 8.3.226 `autoscore` →
  goscorer via `computeScore`) in plain Node over goban's 31 autoscore test games; compared KataGo's
  GTP `final_status_list dead`; wrote docs/build-vs-buy/scoring.md (options A–F).
- Worked: OGS's stored maps 31/31; our KataGo 29/31 with b6, b10 and a full-size g170e b20 net
  (misses shrink with net size); goscorer counts Japanese and Chinese, seki eyes excluded under
  Japanese rules. A b20 net from KataGo's v1.4.5 GitHub release downloads in the cloud, unlike
  katagotraining.org.
- Didn't work / dead ends: GTP's dead list 21–22/31. The seki game misses even with Chinese rules.
  No full-size b18 run (host blocked). The goban-engine WASM estimator needs a browser.
- Lessons: see Lessons (regression set, non-determinism).
- Decisions: asked the owner A (Node service, recommended) or C (port to Scala); pending.
- Verified by Claude: the spike outputs quoted in the memo; reviewer agent re-ran the stored modes
  and cross-checked the numbers (4 blocking findings fixed: strategygames option, circular 31/31,
  three facts, this entry). · Needs owner verification: licence of katagotraining.org networks;
  accuracy with the b18 net on the GPU (Phase 4 benchmark).
- Follow-ups: ADR once the owner answers; Phase 4 decides the lila ⇄ service message (prisoners,
  komi) and the no-KataGo fallback in Node.
### 2026-09-27 · unit 0.5 · KataGo installed and benchmarked in the cloud (CPU)
- Did: `dev/ligo katago install cpu`, `smoke`, `bench` in a cloud session: KataGo v1.18.1 Eigen
  (not the AVX2 build), g170 b6c96 test network, 4 vCPU Intel Xeon @ 2.80 GHz.
- Worked: smoke analysis (50 visits, ownership map of 361 points) in ~1.3 s including startup.
  Benchmark, 200 visits/position, 10 positions: 1 thread 36 visits/s, 2 threads 68, 4 threads
  143 (recommended). A 100-visit run peaked at ~140 visits/s with 8–10 threads.
- Didn't work / dead ends: the full-size network host (media.katagotraining.org) is blocked in
  the cloud, so no b18 numbers here; the b6 test net is far weaker than what scoring will use.
- Lessons: a b6 net on 4 cloud vCPUs does ~140 visits/s, plenty for plumbing tests of the
  scoring service.
- Decisions: KataGo v1.18.1 and the test net are Claude's defaults for the owner to confirm
  (logs/decisions.md).
- Verified by Claude: the numbers above (real output). · Needs owner verification: OpenCL
  benchmark with the b18 network on the AMD GPU (`dev/ligo katago bench`).
- Follow-ups: record the owner's OpenCL benchmark here.
