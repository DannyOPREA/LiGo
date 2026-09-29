---
name: design-adr-review-patterns
description: What to check when reviewing a LiGo design ADR that maps lila's chess model onto Go (core types, BSON schema, round protocol, clocks), e.g. ADR 0019
metadata:
  type: feedback
---

Checks that found real problems in ADR 0019 (unit 3.9, PR #22, 2026-09-28):

- **scalachess has no sources jar in the cache**: unzip the 17.17.1 jar from
  /root/.cache/coursier/v1/https/jitpack.io/... into the scratchpad and use `javap -p -c`
  (Game.applyClock shows the real clock recipe: withFrameLag, step(metrics, gameActive), start when
  playedPlies == 1). Inline extensions (Ply.turn) only show in .tasty strings.
- **Runtime vs load-time truth**: lila's `turnColor` is `chess.Game.player` = `position.color` at
  runtime; ply parity is only used in the BSON reader. Claims "lila derives X from Y" need both paths.
- **Interim phases**: ask what happens in the phase before a feature lands (two passes in Phase 3
  with no scoring phase = clock runs out for a player who can't move).
- **Side-by-side migrations**: the old reader/writer (BSONHandlers required keys, GameDiff) must not
  see the new docs; check `r.bytes`/`r.get` (required) calls.
- **Chess caps and leftovers**: `Game.maxPlies` 600 -> TooManyPlies forces a draw (spec R-END-5 says
  no draws). grep round for chess-only end conditions.
- **Commands named in docs**: check they exist and do what's claimed (`dev/ligo db` starts Mongo, it
  doesn't reset; guard-bash blocks dropping non-ligo_test DBs).
- **Log "couldn't check" lines**: re-check; caches fill from other threads (strategygames jar).

Checks that found real problems in ADR 0020 (unit 4.1, scoring phase, 2026-09-28):

- **"Stop the clock" mid-game**: lila core `Game.outoftimeClock` counts a stopped clock with elapsed > 0
  as out of time; Titivate re-checks stopped-clock games only every 3 days; corresp clock derives
  from `movedAt` (no pause). Any pause design must touch these.
- **Redis re-send claims**: fishnet's `start` re-send (`RoundSocket` `rounds.tellAll`) only reaches
  in-memory round actors; pub/sub drops replies while lila restarts. Persistent timers = `ck`/Titivate.
- **Versionless client commands** (accept/toggle with no count version) race with server-side changes.
- **goban-engine `getHandicapPointAdjustmentForWhite`** gives `handicap` points even for handicap 1
  (spec says 1-stone = none). KataGo analysis accepts komi -400..400 half-integers (tested).
- **Post-processing a service reply** (e.g. widening dead to chains) makes the stored count stale.

**How to apply:** any Phase 3+ design ADR or schema/protocol change. See [[phase-plan-review-patterns]].

Checks that found real problems in ADR 0021 (unit 5.1, Phase 5 ratings, 2026-09-29):

- **Scope creep via wording**: "13×13 rated games are even only" quietly allows 13×13 server games;
  PLAN §1.2/§1.3 and spec R-SCOPE-1 keep 13×13 out of the POC. Grep the spec's R-SCOPE for any size/ruleset named.
- **"No page needs it" claims**: check later unit rows (5.7 "rating ranges shown as rank ranges", §4
  widening rank range) and lila's client code (ui/lobby ratingDifferenceSliders computes ranges in the browser).
- **"lila already enforces" guest rules**: setup forms do (`mode(withRated = me.isDefined)`), but
  `Challenge.accept` lets a guest accept a rated destUser-less challenge (only the view hides the button);
  lobby `Hook.compatibleWith`/`Biter.canJoin` keep guests and members apart entirely.
- **FarmBoostDetection.newAccountBoosting** skips rating for accounts < 7 days old in Friend-source games
  that end fast: breaks any "fresh accounts play a rated game" demo.
- **Recompute the rationale, not just the numbers**: a rank band is only ~±34 rating points near 5k, a
  deviation-250 loss moves ~110, so "midpoint keeps the label after one loss" was false.
- **goratings Chinese handicap 1** adds a compensation point (scoringBonus = handicap) that spec R-KOMI-3 doesn't give.

Checks that found real problems in ADR 0022 (unit 6.1, Phase 6 lobby, 2026-09-29):

- **"The browser already gets every hook/seek"**: false. `LobbySocket` sends `had` only where
  `biter.showHookTo` (canJoin: kind, range, blocks, lame); `SeekApi.forUser` filters by canJoin; hook
  JSON has no rating range. Any "grey out what you can't join" design needs server changes.
- **Pool compatibility is clock-only** (`Hook.compatibleWithPool`, `PoolList.isClockCompatible`,
  `HookRepo.poolCandidates`, `LobbySyncActor` skips instant match): new pool dimensions must reach them.
- **Waiting-range maths**: `pairScore` uses min(missBonus a, b), cap at min rating, +200 range bonus,
  ±ragesit, +30 provisional. "cap + my miss bonus" is an approximation; demand the exact definition.
- **lila already joins-or-creates seeks** (`AddSeek` → findCompatible → BiteSeek, newest first).
- **Wave timing vs PLAN's "<10 s to first move"**: waves are 12–60 s; FullWave needs 20–40 players.
- **Concurrent units in one tree**: verify.sh picked up another unit's uncommitted pool files; check
  `git status` before blaming the diff under review.

Checks that found real problems in ADR 0023 (unit 7.1, Phase 7 analysis/SGF/correspondence, 2026-09-29):

- **goban-engine sources**: extract them from `build/goban-engine.js.map` `sourcesContent` into the
  scratchpad (the package ships only minified JS + .d.ts). Its SGF reader: places moves unchecked
  (`place(x,y,false,false,...)`), no BM/TE/DO/IT glyphs, out-of-turn moves become edits, out-of-range
  points become passes, and a truncated value (`W[dd`) **hangs forever** (verified with a 10 s timeout).
  `MoveTree.toSGF` drops the root comment and writes no glyphs.
- **Two trees**: "keep lila's tree" + "export with goban's MoveTree" = two sources of truth; ask which.
- **lila import dedup** hashes the whole PGN text (MD5, spaces stripped), not the moves; `pgni.h` and
  `pgni.user+pgni.ca` Mongo indexes; `isPgnImport` gates Titivate, delete-own-import, downloads.
- **"your turn"** is a Mongo `$mod` on ply parity (`countWhereUserTurn`) + `Pov.isMyTurn` (needs
  `playable`); CorresAlarm is set only on CorresMoveEvent at 80% of remaining time, once both moved.
- **idbTree** is a no-op on `/analysis` (game id `synthetic`); only game analysis pages persist edits.
- **"Nothing is stored, so 13×13"** then storing 13×13 imports: grep R-SCOPE-1 / ADR 0021 §4.

Checks that found real problems in ADR 0025 (unit 8.2, Phase 8 puzzles, 2026-09-29):

- **goban puzzle mode needs glue**: taps only check the tree when `getPuzzlePlacementSetting()` returns
  `{mode:"play"}` (default "place" = no events); opponent default is "manual"; puzzle taps ignore
  `one_click_submit` (touch-confirm is ours); `place(x,y,true,false,true,...)` skips superko; `bounds`
  is a GobanConfig field, not PuzzleConfig. Extract sources from `build/goban.js.map` (JSON.parse).
- **Solver designs**: TT keyed on position is unsound under situational superko (R-KO-1/R-KO-5, GHI);
  "ko decides it" with no ko-threat model is undefined; region-only search misjudges wall variations
  that open an escape. Check the spike actually meets the PLAN row's "sample within a time budget".
- **verify.sh "No gates apply: only docs/logs/Markdown"** also prints for `tools/**/*.mjs` (no gate).
- lila puzzle leftovers to list: `/training/of-player`, `mobileBc*` routes, `/training/frame`,
  `/api/puzzle/*`, `PuzzleTagger.addAllMissing` daily, path regen cron (`isStale` errors in prod).
