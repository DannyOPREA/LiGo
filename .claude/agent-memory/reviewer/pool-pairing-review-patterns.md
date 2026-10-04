---
name: pool-pairing-review-patterns
description: Checks for LiGo pool/pairing code (GoPairing, MatchMaking, Phase 6): model the waiting range in Python, 9×9 holes, lila-derived code claimed MIT, testQuick vacuity
metadata:
  type: feedback
---

From unit 6.2 (GoPairing in lila/modules/pool, 2026-09-29):

- **Model it independently**: a ~40-line Python copy of rankOf/ratingOf, suggestedStones, gap, lila's
  cap/missBonus/ragesit reproduced the tests' numbers (5k Handicap OK 19×19 -> 13k–4d, 8 stones) and
  exposed what the tests never looked at.
- **9×9 reachable ranks are not contiguous**: one stone = 6 ranks, so ranks 2–4 away from you are
  unreachable while 5–7 away are; a "weakest–strongest" summary (ADR 0022 §4) overstates. Check any
  range summary on 9×9.
- **"MIT, not derived from lila" headers on files that copy lila functions** (pairScore, missBonus):
  lila-derived code is AGPL (COPYING §1); also check UPSTREAM.md lists the edited upstream file.
- **verify.sh lila tests = testQuick**: log said "No tests to run for pool / Test / testQuick"; run
  `pool/testOnly` for a real count (see [[rating-maths-review-patterns]]).
- **Circular expected values**: tests that recompute the implementation's formula; ask for hard numbers.

From unit 6.4 part one (2026-09-30):

- Even `pool/test` printed Total 0 (sbt 2 cache); only `pool/testOnly lila.pool.GoPoolTest ...` ran them.
- "X reaches the score" tests that assert equal output for both inputs can't fail if X is ignored.
- Pool hook-stealing needs rated hooks, which 3.15 forbids until 5.7: that path is dead code, so ask for it to be said.

From unit 6.4 part two (2026-10-04):

- Pool id format changes strand callers outside the unit's files: ui/round "New opponent" (`poolUrl`) and
  lib/poolRangeStorage still built `lim+inc`; byo-yomi pools map to no pool. grep `'/#pool/'` repo-wide.
- verify's ui gate does not typecheck lobby: run `node_modules/.bin/tsc -p tsconfig.json --noEmit` in ui/<pkg>.
- The implementer edited files mid-review (Main.scala broke then got fixed): re-read the diff before reporting.
- GameStarter colour choice (`b != p1.userId`) had no test; only MatchMaking's `black` was tested.

**How to apply:** 6.4 (MatchMaking wiring), 6.6 (tile range display), any later pairing change.
