# Clocks log

## Lessons (curated, ≤ 30 lines — read this first)
- scalashogi's Clock (MIT) models byo-yomi with periods, spentPeriods and periodsInUse; strategygames' clock is based on it (2026-09-25, planning research).
- Speed classification must assume far more moves per game than chess (~120–150 per player on 19×19) (2026-09-25, planning research).
- strategygames' `ByoyomiClock`: `spentPeriods` includes the period in progress once main time is gone (so periods left = total − spent + 1 while in byo-yomi), and its `recordActionTime`/`endTurn` are unimplemented (`???`): only use `step`, `start`, `stop` (2026-09-28, unit 4.2).
- lila reads a game's clock through `GameClock` (`game.gameClock`); `game.clock` is the Fischer clock only and is `None` in a byo-yomi game. Anything asking "has a clock / out of time / how long" must use the view (2026-09-30, unit 4.7).
- Lobby hooks and challenges carry their clock settings as `ClockSettings` (Fischer | Byoyomi); a challenge's
  `clock` is the Fischer one only, so "is it real-time" means `timeControl.clockSettings` (2026-10-04, unit 4.9).

## Entries (newest first)
### 2026-10-04 · unit 4.9 · Byo-yomi and handicap in the setup and challenge forms
- Did: the lobby's and the friend window's forms gain a fourth time mode, byo-yomi (`timeMode` 3):
  the minutes field is its main time, plus `periods` (1–10) and `periodTime` (5 s to 5 min from a
  fixed list), 5 × 30 s by default. Hooks and challenges carry the clock as
  `lila.core.game.ClockSettings` (Fischer | Byoyomi: speed, length estimate, "10+5×30s" label); a
  challenge stores byo-yomi as `l` (main time, so real-time queries find it), `p` and `b`; lobby
  hooks render `clock` and a `byo` block; challenge JSON gains `type: "byoyomi"`. Games from a hook,
  a challenge or a rematch challenge get the byo-yomi clock through `newGoGame(byoyomi = ...)`. The
  friend form and the challenge API take `handicap` (0 even, 1 no stone with Black first, 2–9
  stones; komi defaults to 0.5 with any handicap); the API also takes `byoyomi.{limit,periods,period}`
  instead of `clock`. The lobby's setup window shows both (see the PR).
- Worked: one small settings enum in `core` kept every caller to one `match`; the go-rules setup
  check (`GoGame.start`) now runs inside `GoSetups.make`, so a bad handicap is a form error, not a
  failed game start.
- Didn't work / dead ends: none on the server.
- Lessons: see Lessons.
- Decisions: logs/decisions.md 2026-10-04 row for 4.9 (Claude, under the owner's 2026-09-28
  delegation).
- Verified by Claude: see the PR. · Needs owner verification: create a byo-yomi game and a handicap
  challenge on the real stack (PR's list).
- Review (reviewer agent): fixed its three blocking findings (scalafmt; the challenge pop-up showed "-"
  for a byo-yomi clock; a handicap game's rematch challenge swapped colours, giving the stones to the
  stronger player: it now keeps them) and four small ones (byo-yomi challenges counted as
  correspondence for push notifications and the bot check, the API took `days` with `byoyomi`, the
  challenge page's handicap line is translated). My first note of strategygames' speed estimate was
  wrong: it is main time + 25 × every period (bytecode), now in the decisions row and the browser.
- Follow-ups: byo-yomi in the game module's views and filters (`Query.clock`, the mini-game time
  label, page meta; 4.7's list) is for the thread that owns `lila/modules/game`; pools get byo-yomi in
  6.4 part two; lobby seeks get handicap with 6.5/6.6's Handicap OK chip; rated handicap with 5.7;
  the board API's seek form and bulk pairings stay Fischer and even; the round's own rematch
  (`Rematcher`, not in this unit's files) still swaps colours in a handicap game; 5.7 must let
  byo-yomi games be rated in the setup window (`notForRatedVariant`).
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
- Review (reviewer agent): fixed its two blocking findings (a byo-yomi game nobody started was never
  expirable, so never aborted; a rematch dropped the byo-yomi clock: `newGoGame` now takes byo-yomi
  settings) and four small ones (end-of-game clocks, time left in the "your turn" list, "give more
  time" availability, a corrupt `cy` logged instead of silently dropped).
- Follow-ups: 4.8 stops and restarts the clock around the scoring phase, and must keep
  `Game.outoftime` from treating that stopped clock as flagged; 4.9 creates byo-yomi games (setup,
  pools, `Query.clock` for game filters and "my turn" lists, the time-control label on mini games
  and page meta); 4.10 shows periods on the round page. Known gaps: the byo-yomi step ignores the
  browser's frame lag and reports no compensated lag (go-rules doesn't expose them), so lag
  statistics and playban's flag-sitting checks only cover Fischer games for now.
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
