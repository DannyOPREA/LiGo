# Lobby log

## Lessons (curated, ≤ 30 lines — read this first)
- The owner's core OGS pain is a confusing lobby: hard to read and filter, can't see which games suit you (2026-09-25, requirements).

## Entries (newest first)

### 2026-09-29 · unit 6.1 · ADR 0022: pools, auto-handicap, open challenges, player test, load test
- Did: wrote ADR 0022 (the Phase 6 design): seven rated pools from ADR 0005 with readable ids and
  5 s waves (and lila's miss bonus per second, not per wave), casual tile clicks as lila's casual hooks, the Handicap OK chip as a pool-member flag,
  the handicap pairing score and how it meets lila's cap, the waiting range against a "typical
  opponent", correspondence tiles through lila's own seek matching (even only), open challenges
  greyed in the browser once the server stops hiding joinable-but-unsuitable rows, which rated hooks
  the pools may take, guests kept apart, the player-test method, and k6 for load testing.
- Worked: reading lila's `pool` and `lobby` code first; most of Phase 6 is configuration of what
  lila already does (hook matching, seek join-or-create, the filter in the browser).
- Didn't work / dead ends: the first draft (a) said the browser already gets every open game (lila
  hides the ones you can't join on the server), (b) left lila's clock-only pool compatibility in
  place, (c) described the waiting range and the pairing score loosely, (d) kept lila's 12–60 s
  waves against PLAN §4's 10 s goal, and (e) planned a join-or-create path lila already has. The
  reviewer caught all five, then on a second look (f) that 5 s waves with lila's 12 points per
  missed wave widen the matching 2.4× faster; all fixed before the PR.
- Lessons: check which side filters lobby data (`Biter.canJoin` on the server) before designing
  browser-side greying; lila's pool matching bonuses use the *smaller* miss bonus of the pair and
  the cap at the *lower* rating.
- Decisions: every choice in ADR 0022, Claude's call under the owner's 2026-09-28 delegation
  (logs/decisions.md).
- Verified by Claude: verify.sh; reviewer agent (6 blocking findings, fixed). · Needs owner
  verification: whether the lobby it describes is the one you pictured (PLAN §4).
- Follow-ups: 6.2 (the score and waiting range as code), 6.3 (the player-test kit).

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
