# Lobby log

## Lessons (curated, ≤ 30 lines — read this first)
- The owner's core OGS pain is a confusing lobby: hard to read and filter, can't see which games suit you (2026-09-25, requirements).
- lila hides open games you can't join on the server (`Biter.canJoin` in `showHookTo` and `SeekApi.forUser`), not in the browser (2026-09-29, 6.1).
- lila's pool score uses the smaller miss bonus of the pair, the cap at the lower rating, and a 400-point miss ceiling for good sit counters (2026-09-29, 6.1–6.2).
- On 9×9 one handicap stone covers six ranks, so the ranks a player can meet come in separate runs (2026-09-29, 6.2).
- Since 6.5 players are sent open games they can't join: anything that acts on a client's pick (a bite, a
  seek join) must check `Biter.canJoin` before changing state (`biteHook` used to remove the hook first)
  (2026-10-04, unit 6.5).

## Entries (newest first)
### 2026-10-04 · unit 6.10 · The Phase 6 demo
- What: `lila/tests/e2e-demo/phase6-demo.spec.ts`, run by the `e2e` workflow at desktop and phone
  sizes. A guest clicks the 9×9 3+2 tile another guest waits on, and the game's first stone is timed
  from the landing page (under PLAN §4's 10 s; the time is printed and kept as a test annotation). A
  new 5k and 1d click the same rated 19×19 tile with Handicap OK and get a rated game with five
  stones; the 1d creates a rated 9×9 game from the Custom tile's window and the 5k joins it from Open
  challenges; the 5k challenges the 1d from the 1d's profile, where the window has the five suggested
  stones filled in, and the 1d accepts. Shared helpers in `tests/e2e-demo/players.ts`. Your
  checklist: docs/demos/phase-6.md, ending with the player test (6.3's kit).
- Tests: typechecked (`tsc -p tests/e2e-demo`), oxlint and oxfmt clean here; the cloud session has no
  Docker for Mongo and Redis, so the real run is the PR's `demo` check (the PR carries the `e2e` label).
- Lessons: one account pair per screen size, not per test: lila allows 10 sign-ups per 10 minutes
  from one address, and the Phase 5 demo signs up four. A timed click needs its own rate-limit retry
  that restarts the clock, or a refused attempt's wait gets counted.
- Review (first CI run red): the tile selector also matched the waiting tile's Cancel button (same
  `data-id`), and a rated custom game with exactly a pool's settings joins that pool
  (`hookToPoolMember`) instead of waiting in Open challenges; the demo now picks Chinese rules. The
  timed retry now covers only the click, and the checklist's labels match the page.
- Lessons: target the element type, not just a data attribute a child may share. A full e2e run now
  makes all 10 of lila's sign-ups per 10 minutes from one address (Phases 5, 6 and 8).

### 2026-10-04 · unit 6.8 · One window for custom games and challenges
- What: lila's "Create a game" and "Challenge a friend" windows are one window. An Opponent choice
  (Anyone, the named player, Link for a friend) switches between them and keeps every setting. Presets
  (Last settings, 19×19 Rapid, 9×9 Blitz, Correspondence 1 day) come from the pools the viewer can
  play. Ruleset, komi, handicap and rank range fold under Advanced with a one-line summary, opening by
  themselves when a link fixed one or a rule problem points at one. A named opponent (profile,
  mini-profile, `/?user=X#friend`) pre-fills 5.7's suggested stones, which follow the board size until
  the player picks stones. One remembered store per player, migrated from the old two. The Custom tile
  and a new live-mode "Create a game" button in Open challenges open it. No Scala change.
- Tests: 135 lobby unit tests (36 new), 60 lobby Playwright tests (21 new behaviour tests, 6 new
  screenshots). verify.sh and the strict chess guard pass.
- Review: one blocking bug, fixed with tests: a guest's presets were built from byo-yomi pools, but a
  guest's open game is real time only, so the preset gave a wrong clock. Also fixed: an untouched
  suggestion was saved as the player's choice; an old challenge store opened the Custom tile on
  Unlimited; the opponent choice is now real radio inputs (arrow keys work); switching to Anyone drops
  a link's forced correspondence clock for a guest; "Last settings" lights only when nothing changed.
- Lessons: anything built from pools must be filtered by the clock modes the window allows for this
  viewer. lila's root font is about 12–14px, so `rem` sizes fall short of 44px touch targets on a
  phone: use px. A trimmed e2e page must load dialog CSS itself (`site.asset.loadCssPath`).

### 2026-10-04 · unit 7.5 (ride-along) · Retrying a rate-limited new game
- What: the e2e demos failed on CI's phone run once #122 and 3.20 both created games: lila allows 5 new
  games a minute per IP, and after a refused one the setup window kept its Create button disabled
  (`loading` was only reset on success) and threw on the rate limit's plain-text body instead of
  showing it. `setupCtrl.submit` now resets `loading` on a refusal and shows a text body as is. The
  demos' retry loops dismiss the alert and no longer leave a dangling `waitForResponse` (its 5 s
  rejection failed the test even while the loop was still retrying).
- Tests: reproduced by exhausting the limit with curl first: the phone demo failed as on CI; after the
  fix all 6 demo tests pass starting rate-limited (the 9x9 game waits ~50 s, then plays).
- Lesson: in a Playwright `toPass` loop, start a `waitForResponse` together with its click
  (`Promise.all`), or a failed click leaves the wait to reject on its own and fail the test.

### 2026-10-04 · unit 6.6 (addendum) · Review fixes
- What: the reviewer found two real bugs. Switching Rated to Casual while waiting kept you in the rated
  pool: a Rated/Casual change now stops the wait. Moving between Casual tiles sent a socket `cancel`
  that could land after the new tile's POST and remove the new open game: no cancel then, since lila's
  AddHook already drops the sri's old hook. Also: the waiting tile is no longer a button (its Cancel
  is), tiles read their own text, key repeat is ignored, Esc stops any wait, a tab that wakes from idle
  gets the pool counts at once.
- Tests: 6 new Playwright tests (Casual switch while waiting, Casual Cancel, Casual tile to tile,
  correspondence Cancel, the waiting tile's role, a guest's correspondence sign-up dialog). 33 pass.
- Lesson: lila's dialogs wait for `pubsub.after('polyfill.dialog')`, which the site bundle completes;
  a trimmed e2e page has to complete it itself (ui/lobby/e2e/page.ts finds the pubsub chunk).

### 2026-10-04 · unit 6.6 · The quick-pairing landing view
- Did: the Quick pairing tab is now a chip row (Rated / Casual, Handicap OK / Even only; a guest sees
  "Sign up to play rated games" in place of Rated, and with Casual the handicap chips are off with
  "Casual quick games are even") over ADR 0005's tiles in three columns (9×9, 19×19,
  correspondence) and the Custom button. Each tile shows how many wait: the pool's members with Rated
  (the pool publishes `PoolSize`; the lobby socket sends `poolSizes` to its viewers at most every 2 s
  and to each new connection), the casual open games you could join with Casual. One click waits on
  the tile: Rated joins the pool with the Handicap OK flag, Casual (and every guest click) makes a
  casual open game with the tile's settings, a correspondence tile makes a seek. The waiting tile
  shows the ranks you can meet ("Can meet 3k–1d", "or with up to 5 handicap stones", from
  `GoPairing.waitingRange`, sent to your page as `poolRange` after each wave), the time since the
  click and Cancel. The chips are remembered per player in the browser (`lobby.quick:<name>`).
  Playwright tests of the built page (ui/lobby/e2e: 19 behaviour tests, 8 desktop and phone
  screenshots) run in the `ui` CI job and `dev/ligo test pages`.
- Worked: the round page's test harness (a trimmed page, a stand-in socket) carried over to the lobby
  almost unchanged.
- Didn't work / dead ends: a tile's "0 waiting" line was hidden by lila's global `.none` class; the
  lobby's logo watermark showed between columns of different lengths (now off on this tab).
- Lessons: lila has a global `.none { display: none }`; don't use `none` as a state class.
- Decisions: logs/decisions.md 2026-10-04 row for 6.6 (Claude, under the owner's 2026-09-28
  delegation).
- Verified by Claude: see the PR. · Needs owner verification: the PR's list.
- Follow-ups: the chips as a lila preference once Phase 9's `pref` changes land; correspondence tiles
  have no count.

### 2026-10-04 · unit 6.4 part 2 (addendum) · Pool games are rated
- Did: 5.7's server part (#109) merged while #112 was open, so `GameStarter` now starts rated pool
  games (pools are rated only, ADR 0022 §2); handicap pool games are rated with the handicap as 5.3
  does. This closes 6.4.
- Verified by Claude: whole-server `compile`; `pool/testOnly` 38 passed, `lobby/testOnly` 21 passed.
- Follow-ups: `lib/poolRangeStorage` shifts a player's stored range after a rated pool game by lila's
  clock-only id, which no pool has now, so it does nothing (6.6 replaces the range with ranks).

### 2026-10-04 · unit 6.4 part 2 · ADR 0022's seven pools, Handicap OK and handicap pool games
- Did: `PoolList` is now ADR 0022 §1's seven pools (9×9 1+5×10s, 3+3×20s, 3+2; 19×19 5+5×10s,
  10+5×30s, 20+5×30s, 10+10), each with a `ClockSettings` clock (Fischer or byo-yomi, unit 4.9) and
  ids like `19x19-10m-5x30s`. `PoolMember` carries the Handicap OK chip (`poolIn`'s new `handicap`
  field) and whether the player has a rank; `MatchMaking` gives a pair who both said Handicap OK
  GoPairing's stones and colours, and `GameStarter` starts the game with them (0.5 komi) and with the
  pool's byo-yomi or Fischer clock. Hooks reach a pool by their whole clock settings, so rated
  byo-yomi hooks can now be pulled in. The lobby page reads the pools from the server (`pools` in the
  page data) instead of a copied list; old `#pool/10+10` links find the Fischer pool with that clock.
  The game page's "new opponent" button links to the pool by size, main time and increment or period
  length (`#pool/19x19-10m-*x30s`: its clock shows the periods left, not the starting count).
- Worked: GoPairing (6.2) already had stones, colours and the score, so the pool only had to pass the
  flags in and the stones out.
- Didn't work / dead ends: none.
- Lessons: lila joins a provisional player to a pool at a random rating around their own (to spread
  new players); for handicap that would add up to a stone of noise, so a player with a rank joins at
  their own rating.
- Decisions: logs/decisions.md 2026-10-04 row for 6.4 part 2 (Claude, under the owner's 2026-09-28
  delegation).
- Verified by Claude: `pool/testOnly lila.pool.GoPoolTest lila.pool.GoPairingTest` (38 passed; verify's
  `testQuick` skips the pool module), `lobby/testOnly lila.lobby.GoHookTest` (20), `node ui/test lobby`
  (70), whole-server `compile`, `./ui/build --no-install -p`, verify.sh, the chess guard.
  · Needs owner verification: the PR's list.
- Review (reviewer agent): fixed its blocking finding (the "new opponent" button after a byo-yomi pool
  game linked to no pool) and three optional ones (tests for who takes Black and who has a rank; the
  pool JSON built once). Not done: `lib/poolRangeStorage` still keys ranges by lila's clock-only ids
  (unused while pool games are casual; 6.6 replaces the range with the rank range).
- Follow-ups: pool games become rated after 5.7 (`GameStarter`); 6.6 sends the Handicap OK chip
  (until then nobody gets a handicap pool game), draws the tiles in three columns and shows waiting
  counts.

### 2026-10-04 · unit 6.5 · Open challenges and correspondence tiles on the server
- Did: the lobby now sends each player every open game except those from or to players they block or
  who block them, and those of the other "lame" kind (`Biter.visible`); games they can't join (out of
  their rating range, a member's game seen by a guest or the other way round, rated for a guest) come
  too and are checked on joining (`Biter.canJoin`, unchanged rules). Hooks gain `auth` (made by a
  signed-in player) and, with seeks, `rr` (`{min, max, low?, high?}`, the ranks of the bounds; the
  browser writes "2k–1d", "2k+" or "≤ 1d"). A hook with no range of its own takes any rank: the lobby
  no longer uses lila's chess default range (`RatingRange.defaultFor`, left unused in `rating`).
  The two correspondence tiles (1 and 3 days per move, 19×19 Japanese even) are defined in
  `CorresPresets` and sent as the lobby JSON's `corres`; a click is an ordinary seek, which joins a
  matching seek at once. The open-challenges table's `fit` now applies the server's join rules from
  those fields, greys the rows with a translated reason ("Rated games need an account", "Your rank
  is outside this game's range", "For signed-in players", "For guests") and lists them last; a
  click on one does nothing for a member and offers a guest the sign-up page.
- Worked: hook and seek compatibility already compared the whole Go setup (size, ruleset, komi,
  handicap) since 3.15 and 4.9, so only tests were needed there.
- Didn't work / dead ends: none.
- Lessons: see Lessons.
- Decisions: logs/decisions.md 2026-10-04 row for 6.5 (Claude, under the owner's 2026-09-28
  delegation).
- Verified by Claude: see the PR. · Needs owner verification: the PR's list.
- Review (reviewer agent): fixed its blocking finding (the browser read a provisional rating, which
  lila sends with a minus sign, as negative, so new players saw every ranged game greyed and could
  not join) and five small ones (your own hook from another tab counted as joinable; a new seek now
  matches against every seek you can join, not the 13 shown; rank labels built in the browser, not
  English from the server; a test that couldn't fail; greyed rows get `aria-disabled`). Not done:
  a test of the actor's bite path (needs an actor harness), and hooks still carry their creator's
  socket id to every viewer, as lila's did to every viewer who could join.
- Follow-ups: 6.6 draws the correspondence tiles; 6.7 part two uses the chip row for "suits you"; on a
  phone the greyed row's reason is only in its hover title (6.7 part two's cards could show it).

### 2026-10-04 · fix · Correspondence seeks that differ only in Go setup all show
- Did: lila's `SeekApi.noDupsFor` shows another player's seeks once per game, keyed on variant, days,
  rated and player; since 3.15 two seeks differing only in board size, ruleset or komi showed as one. The
  key now includes the seek's Go setup (an older seek without one counts as the default). The function
  moved to `SeekApi`'s companion so a test can call it; 5 tests in `GoHookTest` (a new test file using the chess variant id would trip the chess guard).
- Worked: found by the 3.17 part 2b thread.
- Didn't work / dead ends: none.
- Lessons: when a setup joins a game's identity, grep for every key lila builds from game properties
  (hook and seek compatibility, de-duplication, pool lookup).
- Decisions: none.
- Verified by Claude: `lobby/testOnly lila.lobby.GoHookTest` 11/11, scalafmt,
  verify.sh. · Needs owner verification: none (seen on the lobby once correspondence games run).
- Follow-ups: none.

### 2026-09-30 · unit 6.7 (part one) · The open-challenges table
- Did: lila's Lobby and Correspondence tabs are one "Open challenges" tab (tabs: Quick pairing · Open
  challenges · Now playing) with a Live / Correspondence chip, remembered like the tab was (a tab stored
  under the old names opens the new one on the same kind of game). One table for hooks and seeks:
  player + rating, board, time, rules + komi, Even (handicap column, from the setup's `handicap` when it
  has one), rated/casual; each row a card on phones (CSS grid, same data). Filter chips (board size,
  live speed from the hook's speed id with ultra-bullet as bullet, rated/casual; none pressed means all;
  your own challenge stays) filter in the browser and are remembered (`lobby.chips`). The rating-vs-time
  chart, the filter form (and its `/setup/filter` fetch), the rating/time column sort, the chess "variants"
  separator and lila's duplicate-hook hiding are gone. `src/openChallenges.ts` holds the pure parts: the
  row shape, the chips, `fit` (joinable / reason / suits: own challenge, guest vs member today) and
  `sortRows` (own first, then suits, joinable, the rest; closest rating to yours first, shortest game
  when there is none), plus `playerRatingLabel` for unit 5.5. Five new `site.xml` keys
  (`openChallenges`, `live`, `goEven`, `goHandicap`, `goNoOpenChallenges`). 25 new tests (node:test, as the others) in
  `tests/openChallenges.test.ts` (rows, chips, fit and sort, the rendered table, the Live chip, the tab
  migration); `goSetup.test.ts` lost its two list tests, now covered there. Checked in Chromium with
  lila's built CSS on a static harness (scratch, not committed): desktop and 390 px phone, live and
  correspondence, a 9x9 chip pressed.
- Worked: one row shape for both kinds made the filter, sort and table code shared; keeping the
  decision in `fit` means 6.5 only edits one function.
- Didn't work / dead ends: importing the controller in a test pulls in lib/socket and the locale
  formatter, so the table is tested with a stand-in controller and `viewerOf`, a pure helper.
- Lessons: the ui test runner can load view files but not `ctrl.ts`; keep testable logic in pure modules.
- Decisions: logs/decisions.md (Claude, under the owner's 2026-09-28 delegation).
- Review (reviewer agent): 2 blocking, fixed before the PR: taps on a phone card's padding did nothing (the row is now found with `closest`), and guests saw every correspondence seek as Anonymous (lila names seek players to everyone); also dropped a raw reason word from the hover title and the double dimming of taken rows. 4 tests added.
- Verified by Claude: `node ui/test lobby` 47/47 (43 before the review fixes), `pnpm lint` (oxlint type-aware, stylelint), `pnpm
  check-format`, `ui/build --no-install --debug` (tsc, esbuild, sass, i18n). · Needs owner
  verification: the live site (hooks arriving over the socket, joining from a phone card); the cloud
  cannot run the full stack.
- Follow-ups: part two after 6.5, 5.5 and 4.9 (rank label, greying and "suits you" ordering from the
  server's fields, handicap column); the server's `/setup/filter` page and `FilterUi` are now unused
  (Scala, another thread); the old `lobby.filter` browser key is left unread.

### 2026-09-30 · unit 6.4 (part one) · Pools play Go
- Did: pools gain a board size (all 19×19 for now) and play in the `go` perf (the lobby's `poolIn`
  now reads the Go rating); every pool runs a wave every 5 s; `MatchMaking` pairs with 6.2's
  `GoPairing.pairScore` (lila's score with the miss bonus per second), every member Even only;
  `GameStarter` creates the pool's own setup. `IsClockCompatible` became `IsPoolCompatible` (clock and
  Go setup), and a hook goes to a pool only when rated, random colour, even, Japanese, standard komi,
  with that pool's clock and size (ADR 0022 §6). 7 tests in `GoPoolTest`, 2 more in `GoHookTest`.
- Worked: 6.2's score dropped into lila's `WMMatching` unchanged, as the typed score function.
- Didn't work / dead ends: ADR 0022's pool list can't land yet: the lobby page hard-codes lila's pool
  ids (`ui/lobby/src/lobby.ts`, another thread's files) and 5 of the 7 pools need byo-yomi (4.7). The
  first sbt run failed on unrelated `common`/`ui` errors from a stale cache; compiling `core` alone
  and re-running fixed it.
- Lessons: lila's lobby page carries its own copy of the pool list; changing pool ids is a server
  and UI change together.
- Decisions: split 6.4 in two and build part one now (Claude, under the owner's 2026-09-28
  delegation; logs/decisions.md).
- Verified by Claude: pool tests 30/30 (run by name: verify.sh's testQuick skips them), lobby `GoHookTest` 5/5, `setup` compiles, scalafmt; reviewer
  agent. · Needs owner verification: none until pools can be played (after 3.20); the app module is
  compiled only by CI here.
- Follow-ups: part two (ADR 0022's pool list with byo-yomi, the Handicap OK chip, handicap and rated
  pool games) after 4.7, 4.9, 5.3 and 5.7, with the lobby page's pool list.

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
