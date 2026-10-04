---
name: scoring-phase-review-patterns
description: Review patterns for go-rules Scoring/GameResult/SGF game-info (unit 4.3+) and the sbt testQuick trap
metadata:
  type: project
---

- In libs/go-rules, `sbt test` is testQuick: prints "Passed: Total 0" when nothing changed. Use `sbt --batch "testOnly *"` (291 tests at 4.3) or `dev/ligo test rules`.
- Count versions (`v`/`cv`) that restart at 1 each scoring phase let a stale accept/toggle from phase N land on phase N+1's first count; check that request numbers are per game, or `v` carries the phase number (ADR 0020 §1 ref has the phase, §6 `v` doesn't).
- Public enum cases like `GameResult.Scored(winner, margin)` allow `B+0` / jigo with a margin; ask for validation or a private constructor.
- `closePlay` state (`closed`) is not an Action, so replay drops it; lila (4.8) must re-close. Check the wiring unit for it.

**Why:** found reviewing unit 4.3 (2026-09-28). **How to apply:** in 4.8 (lila scoring wiring) and 4.11 (SGF export) reviews.

Unit 4.4 (services/scoring, 2026-09-28) defects none of its 82 tests caught:
- goban-engine `autoscore(board, ...)` MUTATES `board` (dead stones set to 0). Anything reading the
  board afterwards (chain widening, computeScore) sees them gone: every proposal said "nothing dead".
  Probe any third-party call for input mutation; the OGS 31-game test only checked autoscore itself.
- Play prisoners were added to the total under Chinese (area) rules too. Probe count with prisoners≠0 per ruleset.
- Child-process clients: no `proc.stdin.on('error')` → EPIPE when the child dies at start is an
  uncaughtException that kills the service. Probe with `bin: '/bin/true'` and a 19x19 payload.
  Also a hung child is never restarted (timeout only rejects).
- `dev/ligo test X` gates may skip the "real" integration test (env vars not exported) while the log claims it ran.

Unit 4.5 (scoring Redis worker, 2026-09-28):
- `JSON.parse('null')` then `req.ref` throws inside ioredis's 'message' emit → uncaughtException kills
  the process (ioredis DataHandler rethrows). Probe every pub/sub listener with `null`, `"x"`, `[]`.
- `start_bg` wraps commands as `tail -f /dev/null | cmd`: when cmd dies, bash+tail live on, so
  `dev/ligo status` says "running" for a dead process. Matters for anything that can crash.
- ioredis 6 autoResubscribe works (probed: Redis restart → numsub back to 1; boot with Redis down 55 s recovers).
- "Docker mode skipped" when the owner's box IS docker mode means the owner never runs the feature; a
  worker with katago=null would still satisfy the protocol, so "no KataGo in containers" isn't a reason.

Unit 4.6 (autoscore bench, 2026-09-29):
- Validate any accuracy grader against a known oracle first: feed it OGS's STORED maps (autoscore is
  31/31 on them). The 4.6 grader (goscorer `owner` + filtered `seal`) scored 29/31 there, so its
  ceiling was below the 97% gate. goscorer's Japanese `owner` omits living stones (territory only);
  `correct_ownership` marks them. propose's `seal` drops points on dead chains; OGS's 's' can sit on one.
- 97% of 31 games = 31/31; with non-deterministic KataGo that's a flaky gate. Ask about set size.
- `Number(flag)` gates: NaN makes `pct < gate` false → prints FAILED but exits 0.
- 4.6 re-review (2026-09-29): verify.sh does NOT run CI meta's manifests check. Any
  `package.json` edit (even a `scripts` line) fails `dev/ci/meta_checks.py manifests <base> HEAD`
  without a COPYING.md change; run it by hand on every unit that touches a manifest.
- Owner steps that call a native-only `dev/ligo` command on the owner's docker-mode box die; check
  STATUS/README "on your box" steps against `MODE` guards (LIGO_MODE=native needs host node/pnpm).
- KataGo analysis engine's NN cache makes `--runs` repeats fast and correlated (run 2 ~5x faster).

Unit 4.8 (scoring phase in lila, 2026-10-04):
- The move that OPENS the phase is not game-ending any more: `stepGoClock(gameActive=false)` on the
  second pass skips Fischer's increment and the byo-yomi period reset (probed: a 30 s period, pass at
  20 s → 10 s left after resume). gameActive=true then `stop` is right. Check every "ends the game"
  clock flag once an end becomes resumable.
- Probe strategygames/go-rules without editing the repo: put a munit file in the scratchpad and run
  `cd libs/go-rules && sbt --batch 'set Test / unmanagedSourceDirectories += file("<dir>"); testOnly X'`
  (one string, `;`-joined; two args get merged). Then delete `target/**/ScratchProbe*` classes.
- Round-side timers: a `Resend` that reloads a terminated round triggers RoundSocket's load-`Wake`,
  which schedules another expiry timer each time (1-day timers in correspondence). Look for dedupe.
- lila restart: only rounds someone is watching reload (lila-ws `r/ons`); a correspondence round
  nobody opens gets no Wake until Titivate's `ck` deadline → reply lost = NoCount.
- verify's "lila tests" gate ran 3 tests (sbt 2 cache); always `testOnly` the unit's suites yourself.
