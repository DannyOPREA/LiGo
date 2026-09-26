# 0003. Situational superko in both rulesets
- Status: Accepted
- Date: 2026-09-26
- Decided by: owner, on Claude's recommendation

## Context
Traditional Japanese rules forbid only immediate ko recapture. Long cycles (e.g. triple ko) end the
game as "no result". Online, that invites abuse and has caused infinite-game bugs elsewhere
(PlayStrategy's 2025 bug history).

## Decision
Use **situational superko** in both the Japanese and the Chinese ruleset: a move may not recreate a
whole-board position that existed earlier with the same player to move.

## Consequences
- Games can never loop forever; there is no "no result" outcome.
- This deliberately departs from traditional Japanese rules in rare cycle positions; the rules spec
  (`docs/rules/`, Phase 1) will say so explicitly.
- Both engines (server and client) must implement the same superko check, which the conformance
  fixtures verify.

## Alternatives considered
Simple ko + "no result" on cycles for Japanese rules; positional superko.
