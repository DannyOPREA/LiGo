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
