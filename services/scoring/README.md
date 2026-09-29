# @ligo/scoring

What this package does, in plain English: after two players pass, LiGo needs to say which stones
are dead, whose territory each empty point is, and the final score. This package does that
scoring, the same way OGS does it: it asks KataGo (a Go-playing AI) what it thinks of the position,
picks out the stones that are clearly dead, and counts the result under Japanese or Chinese rules.
It runs as a small long-running process (`src/main.ts`, unit 4.5) that talks to lila over Redis
(ADR 0020 §1); the scoring logic itself is also callable as a plain function or from a
command-line tool, with no Redis involved, for trying a request by hand.

See [CLAUDE.md](CLAUDE.md) for the engineering rules (what never to change, why); this file is
about running and testing it.

## How it works

1. **Board in, board only.** lila sends the *final* position (after both passes), not the list of
   moves: this package never replays a game, so it can never disagree with the server's own Go
   rules about how the game got there.
2. **`propose`**: for a fresh game just entering the scoring phase, this package asks KataGo twice
   (once assuming Black moves next, once assuming White does) for its read of the position, then
   runs OGS's `autoscore` algorithm on the two answers to pick out the stones that are almost
   certainly dead. If KataGo isn't available (not installed, crashed, or too slow — 30 seconds),
   it answers anyway with nothing marked dead, so players can mark stones by hand instead.
3. **`count`**: given a set of stones the players have agreed are dead (from a fresh proposal, or
   after they've toggled some), this package counts the score. This half needs no AI at all — it's
   a deterministic algorithm (`goscorer`, bundled in `goban-engine`), so the same input always
   gives the same answer.
4. Either way, the answer is: which stones are dead, which points still look unsettled and may
   need another move, who owns each point, and the score for each side (territory, stones,
   prisoners, komi, any handicap compensation, and the total).

## Running it

### As the Redis worker (what `dev/ligo up` starts)

`src/main.ts` is the real entry point: it subscribes to `scoring-in`, publishes replies to
`scoring-out` (ADR 0020 §1), and sends `{"t":"start"}` on boot so lila knows to re-send whatever it
was waiting on. `dev/ligo up`/`down`/`status`/`logs scoring` supervise it in native mode, restarting
it automatically (with backoff) if it ever exits (its pid and log live under `.ligo/`); see
`dev/ligo`'s `scoring_katago_env`/`native_scoring_worker_up` and `services/scoring/CLAUDE.md`'s
"Redis worker" section for what it does and doesn't guarantee (concurrency, dedup of re-sent
requests, crash recovery). Docker mode also starts it, as a `scoring` compose service — but with no
KataGo in any container yet, so it always answers `src:"none"` (ADR 0020 §4's fallback), unlike
native mode which uses real KataGo when `dev/ligo katago env` finds one (`dev/ligo test scoring`
still skips its own test suite in docker mode either way).

Run it by hand:

```sh
cd lila
eval "$(../dev/ligo katago env | sed 's/^/export /')"   # optional: real KataGo, not src:"none"
export KATAGO_MODEL="$KATAGO_TEST_NET" KATAGO_CONFIG="$(dirname "$(readlink -f "$KATAGO_BIN")")/analysis_example.cfg"
export SCORING_REDIS_URL=redis://127.0.0.1:6379   # default; lila's own default too
pnpm --filter @ligo/scoring run start
```

### As a one-shot request (no Redis)

For trying a request by hand, or testing the counting side with no Redis and no KataGo, there's
also a plain function (`handle`, in `src/handle.ts`) and a tiny CLI that reads one request as JSON
on stdin and prints the reply:

```sh
cd lila && pnpm --filter @ligo/scoring run cli <<'EOF'
{"t":"propose","ref":"g:1:1","size":9,"rules":"c","komi":7.5,"handicap":0,
 "board":"9/9/9/2bbbbb2/2wwwww2/9/9/9/9","prisoners":{"b":0,"w":0}}
EOF
```

Without `KATAGO_BIN`/`KATAGO_MODEL`/`KATAGO_CONFIG` set (see `src/cli.ts`'s comment), `propose`
always answers with nothing marked dead — useful for trying the counting side without installing
KataGo. `dev/ligo katago install` sets up KataGo; `dev/ligo katago env` prints the pieces this
package's env vars need (its `KATAGO_GTP_CONFIG` is for a different KataGo mode, not this one — the
analysis config lives next to the installed binary, see `src/cli.ts`).

## Testing it

`dev/ligo test scoring` runs everything (typecheck, lint, and the test suite: `node --test`, no
build step). The test suite includes:

- **OGS's own 31-game regression set**: real finished games from OGS, with KataGo's stored
  analysis of each and the expected dead-stone answer. All 31 must match.
- **LiGo's rules fixtures** (`libs/conformance/`): the same test cases the server's and the
  browser's Go rules engines use, replayed through this package's counting path.
- **Unit tests** for the board format, widening dead stones to whole chains, the KataGo client
  (using a fake `katago` program, so these run without KataGo installed), and the handicap rule.
- **One real-KataGo test**, only when KataGo is actually installed (`dev/ligo katago install`);
  skipped otherwise rather than failing.
- **The Redis worker** (`test/worker.test.ts`, unit 4.5): dedup of re-sent requests, `propose`
  serialized through the one KataGo while `count` runs immediately, and a `handle()` bug turned
  into an `error` reply rather than a crash — all against an in-process fake pub/sub, so these need
  no real Redis.
- **A real Redis round trip** (`test/worker-redis.test.ts`): starts its own `redis-server` on a
  free port and tears it down after; skipped, not failed, when `redis-server` isn't on PATH.


## Benchmark

`dev/ligo scoring bench [--net PATH] [--games DIR] [--gate N] [--runs N] [--limit N] [--timeout MS]`
(native mode) asks a real KataGo for the two ownership maps of each of OGS's 31 autoscore games,
runs `autoscore` on them, and grades autoscore's raw `result`, `needs_sealing` and (where present)
`sealed_result` against the file's expected ownership, with exactly the pass rule of
`test/autoscore.test.ts` (`src/grade.ts`; fed OGS's own stored maps it gives 31/31, a unit test).
It reports per-game mismatches, per-run and total numbers and timing, and, as a secondary figure
that is never gated, whether the widened dead-stone set agrees with the file. The report goes to
`.ligo/scoring-bench/report.json`.

- **Runs and gate.** KataGo's search is not deterministic, so the set runs `--runs N` times
  (default 3). `--gate N` exits non-zero when total correct / total game-runs is below N%; 97% of
  93 game-runs allows 2 misses. Without `--gate` it never fails on accuracy.
- **What the set is.** It is autoscore's own regression set: OGS tuned autoscore against it, 8 of
  the 31 are synthetic corner/dev tests, and the expected results were corrected by hand, not agreed
  by the players. The figure leans optimistic, and "finished games with agreed results" is only
  partly met; a larger set of real finished games is a follow-up. `--games` takes any directory of
  files in the same format.
- **Komi.** The files carry none; KataGo is asked with 7.5 (`--komi` overrides), as in the unit 1.3
  spike.
- **Smoke vs gate.** The cloud figure (b6 test network, CPU) is a smoke figure, not the gate; see
  logs/scoring.md. The gate is measured with the b18 network on the owner's GPU: after pinning
  `NET_SHA256` in `dev/katago.sh`, run `dev/ligo katago install opencl && dev/ligo scoring bench --gate 97`.
