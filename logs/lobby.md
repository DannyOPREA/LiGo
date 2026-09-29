# Lobby log

## Lessons (curated, ≤ 30 lines — read this first)
- The owner's core OGS pain is a confusing lobby: hard to read and filter, can't see which games suit you (2026-09-25, requirements).

## Entries (newest first)

### 2026-09-29 · Phase 6 breakdown · The lobby split into units 6.1–6.10
- Did: split Phase 6 into 10 units (docs/PLAN.md §5, "Phase 6 units"): a design ADR (6.1), pairing
  with auto-handicap as new code in `lila/modules/pool` (6.2), the player-test kit (6.3), then the
  lila halves: pools (6.4), open challenges and correspondence presets on the server (6.5), the
  quick-pair grid with the chip row and waiting (6.6), the open-challenges table (6.7), one custom
  game and challenge modal (6.8), a load test (6.9) and the demo followed by the player test (6.10).
- Worked: lila already has each piece (pools behind the grid, hooks and seeks tables, the setup and
  challenge modals, a profile challenge button), so every unit adapts one; ADR 0021 §4 already fixes
  the stone count, and 5.2's `GoRating` has it, so the pairing maths can be built before the fork.
- Didn't work / dead ends: none.
- Lessons: lila's pools are always rated (`GameStarter` sets `Rated.Yes`) and a guest's click on a
  pool tile becomes a casual hook (`xhr.anonPoolSeek`), so the "Rated / Casual" chip is a design
  question for 6.1, not a setting to wire up.
- Decisions: the split itself, Claude's call under the owner's 2026-09-28 delegation
  (logs/decisions.md).
- Verified by Claude: verify.sh. · Needs owner verification: whether the split reads right.
- Follow-ups: 6.1 next, then 6.2 and 6.3.
