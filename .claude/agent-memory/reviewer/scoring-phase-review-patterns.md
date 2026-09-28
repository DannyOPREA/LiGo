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
