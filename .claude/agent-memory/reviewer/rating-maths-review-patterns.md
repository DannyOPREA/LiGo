---
name: rating-maths-review-patterns
description: Checks for LiGo rating code (GoRating, PerfsUpdater, Phase 5): regenerate goratings fixtures, verify gate vacuity, lila caps vs Go caps, licence register gaps
metadata:
  type: feedback
---

From unit 5.2 (GoRating in lila/modules/rating, 2026-09-29):

- **Regenerate the oracle yourself**: goratings @ 6cab309 raw files are reachable
  (raw.githubusercontent.com); run the test-resource generator into the scratchpad and `diff` against
  the committed JSON (5.2's was byte-identical). Also diff the vendored LICENSE text vs the NOTICE.
- **verify.sh "lila tests" gate is testQuick**: prints "No tests to run for rating / Test / testQuick"
  once tests passed before. Run `sbt -batch "rating/testOnly lila.rating.*"` for a real count.
- **scalachess internals via javap** (jar in coursier cache, see [[design-adr-review-patterns]]):
  `GlickoCalculator` 3rd ctor arg = ColorAdvantage, default zero; `skipDeviationIncrease=false`
  applies step 6 as exactly one period (lastRatingPeriodEnd unused in updateRatings);
  `Glicko.provisional` is `deviation >= 110`.
- **lila's caps are chess values**: `GlickoExt.cap` clamps volatility to 0.1 and `sanityCheck` rejects
  >= 0.2; a Go `maxVolatility` constant that nothing applies is dead until the caller caps with it.
- **ADR side-conditions on pure functions**: e.g. "unknown player (1500/500) gets an even game" can't
  be encoded by a function taking only ratings; ask where it lives.
- **New MIT files inside lila/**: COPYING §1 says LiGo's lila/ changes are AGPL, §2 doesn't list
  lila/; UPSTREAM.md claims every lila/ change is registered. Check both for new files.

**How to apply:** 5.3 (PerfsUpdater), 5.4–5.7 reviews and any later rating-maths change.
