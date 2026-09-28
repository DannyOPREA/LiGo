---
name: design-adr-review-patterns
description: What to check when reviewing a LiGo design ADR that maps lila's chess model onto Go (core types, BSON schema, round protocol, clocks), e.g. ADR 0019
metadata:
  type: feedback
---

Checks that found real problems in ADR 0019 (unit 3.9, PR #22, 2026-09-28):

- **scalachess has no sources jar in the cache**: unzip the 17.17.1 jar from
  /root/.cache/coursier/v1/https/jitpack.io/... into the scratchpad and use `javap -p -c`
  (Game.applyClock shows the real clock recipe: withFrameLag, step(metrics, gameActive), start when
  playedPlies == 1). Inline extensions (Ply.turn) only show in .tasty strings.
- **Runtime vs load-time truth**: lila's `turnColor` is `chess.Game.player` = `position.color` at
  runtime; ply parity is only used in the BSON reader. Claims "lila derives X from Y" need both paths.
- **Interim phases**: ask what happens in the phase before a feature lands (two passes in Phase 3
  with no scoring phase = clock runs out for a player who can't move).
- **Side-by-side migrations**: the old reader/writer (BSONHandlers required keys, GameDiff) must not
  see the new docs; check `r.bytes`/`r.get` (required) calls.
- **Chess caps and leftovers**: `Game.maxPlies` 600 -> TooManyPlies forces a draw (spec R-END-5 says
  no draws). grep round for chess-only end conditions.
- **Commands named in docs**: check they exist and do what's claimed (`dev/ligo db` starts Mongo, it
  doesn't reset; guard-bash blocks dropping non-ligo_test DBs).
- **Log "couldn't check" lines**: re-check; caches fill from other threads (strategygames jar).

Checks that found real problems in ADR 0020 (unit 4.1, scoring phase, 2026-09-28):

- **"Stop the clock" mid-game**: lila core `Game.outoftimeClock` counts a stopped clock with elapsed > 0
  as out of time; Titivate re-checks stopped-clock games only every 3 days; corresp clock derives
  from `movedAt` (no pause). Any pause design must touch these.
- **Redis re-send claims**: fishnet's `start` re-send (`RoundSocket` `rounds.tellAll`) only reaches
  in-memory round actors; pub/sub drops replies while lila restarts. Persistent timers = `ck`/Titivate.
- **Versionless client commands** (accept/toggle with no count version) race with server-side changes.
- **goban-engine `getHandicapPointAdjustmentForWhite`** gives `handicap` points even for handicap 1
  (spec says 1-stone = none). KataGo analysis accepts komi -400..400 half-integers (tested).
- **Post-processing a service reply** (e.g. widening dead to chains) makes the stored count stale.

**How to apply:** any Phase 3+ design ADR or schema/protocol change. See [[phase-plan-review-patterns]].
