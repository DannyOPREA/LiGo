# 0005. Initial lobby presets
- Status: Accepted
- Date: 2026-09-26
- Decided by: owner, on Claude's recommendation

## Context
The lobby opens on a one-click quick-pair grid. It needs a starting set of presets.

## Decision
Start with these presets (byo-yomi written as main time + periods × period length):

| 9×9 | 19×19 | Correspondence |
|---|---|---|
| 1 min + 5×10 s | 5 min + 5×10 s | 1 day/move |
| 3 min + 3×20 s | 10 min + 5×30 s | 3 days/move |
| 3+2 Fischer | 20 min + 5×30 s | |
| | 10+10 Fischer | |

Defaults: Japanese rules and the ruleset's default komi. There's one persistent chip row:
Rated/Casual and Handicap OK/Even only.

## Consequences
The Phase 6 player test may tune these; any change is a new ADR that supersedes this one.

## Alternatives considered
lichess-style speed buckets without byo-yomi; a larger grid including 13×13 (out of POC scope).
