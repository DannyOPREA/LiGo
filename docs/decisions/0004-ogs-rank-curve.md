# 0004. OGS rank curve for kyu/dan display
- Status: Accepted
- Date: 2026-09-26
- Decided by: owner, on Claude's recommendation

## Context
Ratings are Glicko-2 in one overall pool, displayed as kyu/dan ranks. A flat "100 points per rank"
scale can't make one rank equal one handicap stone at every strength.

## Decision
Adopt OGS's published rating → rank curve, `rank = ln(rating / 525) × 23.15`, with the exact
constants and rank labels verified against OGS's `goratings` repository during Phase 5. Show a
provisional "?" while rating deviation is high.

## Consequences
- LiGo ranks line up with OGS ranks, which Western players already know; this also eases any
  handoff to OGS.
- Self-declared starting ranks map to ratings through the inverse curve.
- Handicap-adjusted rating maths (also OGS's approach) builds on this curve.

## Alternatives considered
The EGF formula; PlayStrategy's piecewise-linear mapping; numbers only.
