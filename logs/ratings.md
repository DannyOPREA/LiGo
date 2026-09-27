# Ratings log

## Lessons (curated, ≤ 30 lines — read this first)
- OGS: Glicko-2, rank = ln(rating/525) × 23.15 (ADR 0004); handicap handled by shifting effective rank by a stone value that depends on board size and ruleset (2026-09-25, planning research).
- scalachess's Glicko-2 module is MIT and reusable (2026-09-25, planning research).
- scalachess `GlickoCalculator(tau = 0.5)` with `skipDeviationIncrease = false` reproduces goratings' `glicko2_update` to 6 decimals; lila itself runs tau 0.75 and skips step 6 (2026-09-27, unit 1.4).
- goratings' handicap/rank maths is in `analysis/util/RatingMath.py`, not its package; its `analysis/util/__init__` needs filelock etc., so load RatingMath.py and CLI.py directly (2026-09-27).
- Handicap per OGS: update each player against the opponent's effective rating (shift in rank space), i.e. two calculator calls per game; scalachess `ColorAdvantage` is symmetric and fixed, not a fit (2026-09-27).
- The "?" threshold (`provisionalDeviation = 110`) is a scalachess top-level val, not a lila constant; changing it means a fork or replacing call sites (2026-09-27).

## Entries (newest first)

### 2026-09-27 · 1.4 · Build-vs-buy: ratings (scalachess Glicko-2 + goratings formulas)
- Did: read lila's rating module and PerfsUpdater, scalachess-rating 17.17.1, goratings @ 6cab309 and OGS's rank_utils.ts @ d94be54, PlayStrategy's lila rating module. Spiked scalachess-rating in a throwaway sbt 2.0.9 / Scala 3.8.4 project with a Scala port of goratings' rank curve and handicap maths, and ran the same cases through goratings' own Python. Wrote docs/build-vs-buy/ratings.md; asked the owner A (OGS settings) vs A2 (lila settings).
- Worked: 5/5 Glicko-2 per-game updates identical to 6 decimals (lila's floors/caps/start values still differ; listed in the memo) with tau 0.5 and step 6; 90/90 handicap grid rows identical; a 4-stone game identical to goratings' one-game-at-a-time pattern. ADR 0004's curve constants (525, 23.15) confirmed in goratings and OGS's frontend.
- Didn't work / dead ends: importing `analysis.util` needs filelock (not installed; loaded the two files directly instead of installing anything). raw.githubusercontent.com 404'd for OGS's frontend path; a sparse blobless clone worked.
- Lessons: see the 2026-09-27 lines in Lessons. The reviewer caught three memo issues before the PR: the parameter table left out lila's volatility, start values, ±700 cap and bot halving; the "?" threshold lives in scalachess, not lila; and goratings' 9×9 stone value (6 ranks) settles a PLAN §10 item deferred to Phase 5, so the owner question now says so.
- Decisions: A vs A2 asked in the unit thread, pending (logs/decisions.md). ADR follows the answer.
- Verified by Claude: the spike outputs quoted in the memo. · Needs owner verification: none technical; the choice itself.
- Follow-ups: Phase 5 writes the GoRank/handicap glue in lila/modules/rating and PerfsUpdater, with goratings' MIT notice in COPYING.md; auto-handicap stone count and cap stay a Phase 5 lobby decision (9×9 stones are worth 6 ranks each, so the cap matters there); one overall Go perf replaces lila's per-speed perfs in Phase 5.
