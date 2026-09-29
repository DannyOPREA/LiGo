# Lobby log

## Lessons (curated, ≤ 30 lines — read this first)
- The owner's core OGS pain is a confusing lobby: hard to read and filter, can't see which games suit you (2026-09-25, requirements).
- lila hides open games you can't join on the server (`Biter.canJoin` in `showHookTo` and `SeekApi.forUser`), not in the browser (2026-09-29, 6.1).
- lila's pool score uses the smaller miss bonus of the pair, the cap at the lower rating, and a 400-point miss ceiling for good sit counters (2026-09-29, 6.1–6.2).
- On 9×9 one handicap stone covers six ranks, so the ranks a player can meet come in separate runs (2026-09-29, 6.2).

## Entries (newest first)

### 2026-09-29 · unit 6.3 · The player-test kit
- Did: `docs/research/lobby-test/`: README (when and how to run it, set-up once, what happens to the
  notes), protocol.md (the session script: consent, four tasks read word for word on OGS and LiGo,
  2- and 4-minute stuck rules, the 1–7 ease question, closing questions, what to watch for),
  consent.md (what to tell participants, recording only with their OK, deleted after notes),
  notes-template.md (one per participant: timings, ease, errors, quotes). Follows ADR 0022 §9.
- Worked: the four tasks map one to one onto PLAN §4's goals; LiGo-only closing questions ask about
  the choices ADR 0022 left to the test (guests kept apart, the widening range, greyed rows, presets).
- Didn't work / dead ends: none.
- Lessons: on LiGo a quick-pair task needs a partner already waiting (the owner's helper account),
  or the test measures an empty pool rather than the lobby.
- Decisions: task wording and the 2/4-minute stuck rules (Claude, under the owner's 2026-09-28
  delegation).
- Verified by Claude: verify.sh (docs only); read through against ADR 0022 and PLAN §4. · Needs
  owner verification: the kit is run by you after 6.10; skim protocol.md for anything you'd word
  differently.
- Follow-ups: run it after 6.10; Claude writes results.md from the notes.

### 2026-09-29 · unit 6.2 · Pairing with auto-handicap in lila/modules/pool
- Did: `lila.pool.GoPairing` (new, AGPL as it adapts lila's `MatchMaking`): the stones and Black
  for a pair (ADR 0021 §4 via `GoRating.suggestedStones`, only when both said Handicap OK and both
  have a rank), ADR 0022 §3's handicap gap term, lila's pair score with that term and a per-second
  miss bonus (5 points per 5 s wave, lila's ceiling), and the waiting range against a typical
  opponent (§4). `MatchMaking`'s score and bonus helpers become `private[pool]` so the Go score
  reuses them. 23 tests in `GoPairingTest`, one checking the even-pair score equals lila's own.
  Nothing calls it yet (6.4 wires it in).
- Worked: reusing lila's own bonus functions keeps the Go score identical to lila's apart from the
  documented terms; the reviewer re-derived the key numbers in an independent Python model.
- Didn't work / dead ends: hand-worked expected values were off by a point (ratings are whole
  numbers) and a 5k's first-wave reach is 8 stones, not 9. lila's miss-bonus ceiling is 400 for a
  player with a good sit counter, not 460 (ADR corrected before merge). A typical opponent with a
  good sit counter left a player with a bad one no range at all; it now shares the member's sit
  counter, as lila pairs like with like. Review found the 9×9 range has gaps (a stone covers six
  ranks), so the tile shows only the unbroken run around your rank (ADR 0022 §4 amended), and that
  the first header wrongly said MIT.
- Lessons: sbt 2's disk cache sometimes misses an edit to a test file and runs the old class (the
  failure points at a line that no longer holds that code); appending a line forced a recompile.
  Check for "compiling N Scala sources" after an edit. verify.sh's `testQuick` skipped the pool
  tests ("No tests to run"): quote a `testOnly` run instead.
- Decisions: 9×9 waiting range shown as the run around your own rank plus "or with up to N stones";
  typical opponent shares your sit counter (Claude, under the owner's 2026-09-28 delegation).
- Verified by Claude: `pool/testOnly lila.pool.GoPairingTest` 23/23; verify.sh; reviewer agent (3
  blocking findings fixed). · Needs owner verification: none until 6.4 wires it into real pools.
- Follow-ups: 6.4 (pools), 6.6 (the tile showing the range).

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
