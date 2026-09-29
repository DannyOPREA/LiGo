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

**How to apply:** 6.4 (MatchMaking wiring), 6.6 (tile range display), any later pairing change.
