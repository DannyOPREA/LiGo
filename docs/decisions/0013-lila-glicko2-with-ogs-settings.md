# 0013. lila's Glicko-2 with OGS's settings, rank curve and handicap maths
- Status: Accepted
- Date: 2026-09-28
- Decided by: owner (on Claude's recommendation)

## Context
LiGo rates games with Glicko-2 in one overall pool, shows ratings as kyu/dan on OGS's curve
([ADR 0004](0004-ogs-rank-curve.md)), and rates handicap games (PLAN §1.2, §3.7). Unit 1.4 spiked
lila's own engine (`scalachess-rating` 17.17.1, already a lila dependency) against OGS's `goratings`
(MIT). The spike and options are in [the build-vs-buy memo](../build-vs-buy/ratings.md): with tau 0.5
and the standard step 6, lila's engine reproduces goratings' per-game update to 6 decimals, and a
Scala port of goratings' rank curve and handicap maths matches OGS's Python on all 90 cases tried.

## Decision
Option A: keep lila's Glicko-2 engine and rating module, set up with OGS's Glicko-2 settings, plus
glue ported from goratings (`analysis/util/RatingMath.py` @ `6cab309`):
- Change four lila constants for Go: tau 0.5; apply Glicko-2 step 6 in each update (don't skip the
  deviation increase); new player's volatility 0.06; volatility ceiling 0.15.
- Keep lila's other values: "?" while deviation ≥ 110 (it lives in scalachess), deviation 45–500,
  rating 400–4000, ±700 per game, bot halving, inactivity aging at 0.21436 periods/day.
- Rank = ln(rating / 525) × 23.15; labels `ceil(30 − rank)`k below 30, `floor(rank − 29)`d from 30.
- Handicap: goratings' formula (handicap, komi, ruleset, board size → rank difference; a stone is
  1 rank on 19×19, 3 on 13×13, **6 on 9×9**; one stone means "no komi"; fair komi 6 territory / 7
  area). Each player is updated against the opponent's rating shifted in rank space, i.e. two
  calculator calls per game. This settles PLAN §10's deferred "9×9 stone value".
- The glue (~60 lines) lives in `lila/modules/rating` and `PerfsUpdater`, is MIT with goratings'
  notice in COPYING.md, and is written from the memo rather than copied from OGS's AGPL frontend.
  It lands in Phase 5, with the one-overall-pool change.

## Consequences
- No new dependency; the same per-game maths and rank scale as OGS, though ratings from a different
  player pool aren't transferable one-for-one.
- "?" disappears after fewer games than on OGS (110 vs 160); changing that would mean a scalachess
  fork or a wrapper over every call site.
- The auto-handicap stone count and its cap (especially on 9×9) stay a Phase 5 lobby rule.

## Alternatives considered
Same formulas with lila's own Glicko-2 settings (A2, runner-up); port goratings' Glicko-2 to Scala
(B); run goratings as a service (C); EGF GoR or per-size pools (D). See the memo.
