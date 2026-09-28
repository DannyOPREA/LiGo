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

**How to apply:** any Phase 3+ design ADR or schema/protocol change. See [[phase-plan-review-patterns]].
