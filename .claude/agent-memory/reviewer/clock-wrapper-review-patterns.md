---
name: clock-wrapper-review-patterns
description: Pitfalls when reviewing LiGo's wrapper over strategygames' ByoyomiClock (unit 4.2 and lila's clock glue in 4.7)
metadata:
  type: project
---
strategygames ByoyomiClock quirks to probe when a wrapper or lila glue touches it (found reviewing unit 4.2, 2026-09-28):
- `limit = config.initTime`; with main time 0 the first period is `byoyomi atLeast 5 s` (a 2 s period gives 5 s first). isValid of 1 s periods hides this.
- `giveTime` during byo-yomi banks time: step's `setRemaining(... atLeast byoyomi)` keeps the surplus across moves.
- `step` on a stopped clock (timestamp None) switches player and charges nothing: lila must `start` after scoring resume.
- `step(gameActive=false)` still switches player; `recordActionTime`/`endTurn` are `???`.
- Negative giveTime is unguarded (instant flag).
**How to apply:** write a scratch munit test (temporary, then delete) printing readings for these cases; check lag tests can fail with zero compensation. See [[review-patterns-general]].
