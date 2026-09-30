# Clocks log

## Lessons (curated, ≤ 30 lines — read this first)
- scalashogi's Clock (MIT) models byo-yomi with periods, spentPeriods and periodsInUse; strategygames' clock is based on it (2026-09-25, planning research).
- Speed classification must assume far more moves per game than chess (~120–150 per player on 19×19) (2026-09-25, planning research).
- strategygames' `ByoyomiClock`: `spentPeriods` includes the period in progress once main time is gone (so periods left = total − spent + 1 while in byo-yomi), and its `recordActionTime`/`endTurn` are unimplemented (`???`): only use `step`, `start`, `stop` (2026-09-28, unit 4.2).
- lila reads a game's clock through `GameClock` (`game.gameClock`); `game.clock` is the Fischer clock only and is `None` in a byo-yomi game. Anything asking "has a clock / out of time / how long" must use the view (2026-09-30, unit 4.7).

## Entries (newest first)
### 2026-09-30 · unit 4.7 · Byo-yomi clocks in lila
- Did: lila's `Game` gains `byoyomi: Option[ByoyomiClock]` beside the Fischer `clock`, and a small
  clock view `lila.core.game.GameClock` (Fischer | Byoyomi) with what both share: running, out of
  time, time left, time used, expected length, speed, more time. The round steps whichever clock a
  Go game has (`stepGoClock`), with the browser's reported lag and move time; it starts after both
  sides have played, stops when play ends or the game finishes, and flags a player whose last period
  ran out (`Game.outoftime`, Titivate, the round). Stored under `cy` (settings, time used, periods
  used up, side to move, running since), with the clock history in `cw`/`cb` for both kinds and
  `GameDiff` writing `cy`. Move events and the round's clock JSON gain `periods` and `byo`; the
  "give more time" button and lila's restart grace add to byo-yomi clocks too; a takeback gives the
  turn back. lila-ws's mini boards gain `wp`/`bp` (periods left).
- Worked: keeping `Game.clock` as the Fischer clock meant no chess-era reader had to change; only
  the places that ask "does this game have a clock / is it out of time / how long is it" read the
  new view.
- Didn't work / dead ends: my first takeback test had the wrong side to move (my mistake, not
  strategygames').
- Lessons: see Lessons.
- Decisions: logs/decisions.md 2026-09-30 row for 4.7 (Claude, under the owner's 2026-09-28
  delegation).
- Verified by Claude: see the PR. · Needs owner verification: none until 4.9 lets you create a
  byo-yomi game; the round page shows its periods from 4.10.
- Follow-ups: 4.8 stops and restarts the clock around the scoring phase; 4.9 creates byo-yomi games
  (setup, pools, `Query.clock` for game filters); 4.10 shows periods on the round page.
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
- Review (reviewer agent): nothing blocking; fixed its non-blocking findings: periods under 5 s
  refused without main time (strategygames makes the first one 5 s), give-time refused for 0 or
  less and its banking in byo-yomi documented and tested, a move on a stopped clock charging
  nothing documented, a stronger lag test, and tests for main time running out on a move, a
  game-ending move, grace, and restoring main-time-0 and White-first clocks (21 tests).
- Verified by Claude: `dev/ligo test rules`, verify.sh. · Needs owner verification: none for the
  library; the lila side (`cy` storage, clock JSON, lag stats and last-move time dropped on restore)
  is only exercised in unit 4.7.
- Follow-ups: lila's clock interface and `cy` storage in unit 4.7.
