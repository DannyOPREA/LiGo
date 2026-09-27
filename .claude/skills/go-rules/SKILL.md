---
name: go-rules
description: LiGo's Go rules knowledge - the approved decisions, the conformance fixture format and how to import cases from existing suites. Use for any question or code about legality, ko and superko, captures, seki, scoring, komi or handicap.
---

# Go rules in LiGo

The truth is `docs/rules/` (written by go-rules-expert in Phase 1, approved by the owner) plus the
fixtures in `libs/conformance/fixtures/`. Until docs/rules is filled in, these are settled:

- Rulesets: **Japanese** and **Chinese**. Board sizes 19×19 and 9×9.
- **Situational superko in both rulesets** (ADR 0003): a move may not recreate an earlier
  whole-board position with the same player to move. No "no result" outcome. This deliberately
  departs from traditional Japanese rules in rare cycles; the spec must say so.
- End of game: two consecutive passes → scoring phase: KataGo proposes dead stones, both players
  accept, adjust or resume. goscorer computes the final score (never re-implement Japanese
  territory counting in Scala).
- Handicap and komi: rated games get automatic handicap from the rank difference (PLAN §3.7).

## Fixture format (PLAN §3.3)
JSON cases replayed by both engines (server strategygames adapter, client goban-engine):
`size, rules, komi, setup, moves, expect{legal, board, captures, koPoint, deadStones → score}`.
Each fixture records its source.

## Where cases come from (in this order)
goban / goban-engine tests, strategygames tests, KataGo's rules tests, then new cases for
PlayStrategy's known bug classes (early end on repetition, infinite games, dead-stone expiry) and
classic traps: seki, bent-four, snapback, triple ko, sending-two-returning-one, suicide, handicap
compensation.

Interpretations not settled above go to the owner (/ask). Only go-rules-expert edits fixtures.
