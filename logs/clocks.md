# Clocks log

## Lessons (curated, ≤ 30 lines — read this first)
- scalashogi's Clock (MIT) models byo-yomi with periods, spentPeriods and periodsInUse; strategygames' clock is based on it (2026-09-25, planning research).
- Speed classification must assume far more moves per game than chess (~120–150 per player on 19×19) (2026-09-25, planning research).
- strategygames' `ByoyomiClock`: `spentPeriods` includes the period in progress once main time is gone (so periods left = total − spent + 1 while in byo-yomi), and its `recordActionTime`/`endTurn` are unimplemented (`???`): only use `step`, `start`, `stop` (2026-09-28, unit 4.2).

## Entries (newest first)
### 2026-09-28 · unit 4.2 · Byo-yomi clock in libs/go-rules
- Did: `ligo.gorules.ByoyomiClock` wraps strategygames' `ByoyomiClock` (ADR 0012) behind
  go-rules' own types: settings, start/stop, a move with lag compensation, out of time, a reading
  per player, give-time, and a storable `ByoyomiState` for lila's `cy` key (ADR 0020 §7). No
  increment. White's clock is current first in handicap games.
- Worked: strategygames' clock already has Japanese byo-yomi (periods kept on a move in time, used
  up when they run out, out of time after the last) and lila's lag compensation; the wrapper is
  glue. 15 tests driven by a fake wall clock.
- Didn't work / dead ends: my first tests misread `spentPeriods` (it counts the period in
  progress), and the reading showed "1 period, 0 s" at the moment of flagging; the reading now
  says 0 periods once out of time.
- Lessons: see Lessons (spentPeriods; `???` methods).
- Decisions: settings are only checked structurally (main ≥ 0, periods ≥ 1, period ≥ 1 s); which
  values lila offers is unit 4.9's (Claude, under the owner's 2026-09-28 delegation).
- Verified by Claude: `dev/ligo test rules`, verify.sh. · Needs owner verification: none.
- Follow-ups: lila's clock interface and `cy` storage in unit 4.7.
