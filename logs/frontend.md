# Frontend log

## Lessons (curated, ≤ 30 lines — read this first)
_none yet_

## Entries (newest first)
### 2026-10-04 · unit 7.7 review · Reviewer findings fixed
- Did: the reviewer found nothing blocking. Its two should-fix items are fixed. The days clock now
  also stands still once the game is over (a counted game ends while the clock stands still, and
  the clock ticked again afterwards). The browser test now zeroes the player-to-move's days clock
  in the scoring phase, runs the page's clock 3 s and checks that no `flag` is sent.
- Worked: the new unit test ("stands still once the game is over") and the browser check both fail
  with the guard removed and pass with it (round e2e 25/25, three runs).
- Didn't work / dead ends: the first browser check zeroed White's clock while Black was to move, so
  it passed with the bug too; and checking `server.received` straight after `runFor` raced the
  websocket. A score toggle sent afterwards gives an ordered sync point.
- Lessons: to assert a websocket message was NOT sent, send a later one and wait for it; the socket
  keeps order. Zero the clock of the colour whose turn it is, or the tick never touches it.
- Follow-ups (nits, not fixed here): `resVsX` wording for a no-result game in the bell; TimelineUi
  and RoundUi still say "draw" for a no-result game; whats-next is re-asked on every scoring event;
  no unit test for `moveOn`.

### 2026-10-04 · unit 7.7 · Correspondence UI
- Did: a correspondence Go game on the game page. Lila's days clock (`corresClock`) already worked with Go;
  what was missing was the scoring phase. The days clock now stands still in the phase (no ticking, no
  flag, no "running" or "out of time" look, whatever a stored turn clock says), the phase's countdown reads
  in days, hours or minutes ("1 day 2 hours left to agree", "5 hours 12 minutes", "2:41"), and
  `RoundController.isMyTurn` says what the server's `Pov.isMyTurn` says (your move, or a count you have not
  accepted): the tab reads "Time to count the game", lila's "play the next game" setting stays on a game
  that waits for your answer and moves on once you accept. The lobby's "now playing" row says "Time to
  count the game" for such a game. The bell has a `scoringPhase` entry and a no-result `gameEnd`
  ("Your game ended with no result"), through one new optional field on the server's `GameEnd` notification.
- Checked on the server, nothing to change: the lobby's now-playing list, `/account/now-playing`, the
  round's next-game button (`whatsNext`, `selectNext`), the blind lobby and `nbMyTurn` all read
  `Pov.isMyTurn`, which 7.6 made count the scoring phase; the JSON a list row gets already carries
  `go.phase`.
- Worked: the round e2e harness took a `correspondence` option (days clock data, no real-time clock, no
  moretime) and the existing scoring fixtures; the new browser tests need no timers because the days
  clock's tick is a unit test (a captured interval callback called by hand).
- Didn't work / dead ends: a route added in a Playwright test before `openRound` never answers, because
  routes added later win and `openRound` adds a catch-all that aborts: add test routes after it. The bell's
  tests could not read text from the tests' i18n stand-in (it gives functions, which snabbdom takes for
  element data), so that test swaps in a stand-in whose plain keys are strings.
- Not done: a reload mid-phase shows the days clock as lila computes it (the turn colour's time since the
  second pass, so smaller than at the second pass, never flagged); a game with its proposal never arrived
  shows no scoring countdown beyond the phase's own `expiresIn` (7.6 / ADR 0023 §4). The game page's
  opponent-gone "claim victory" still asks the turn clock, not the count (the server decides, 7.6).
- Lessons: the page's own idea of "my turn" (`game.player === me`) is wrong in the scoring phase; ask
  `ctrl.isMyTurn()`, which agrees with the server's lists.
- Decisions: four rows in logs/decisions.md (2026-10-04, unit 7.7).
- Needs owner verification: a real correspondence Go game on the stack to the second pass: the bell shows
  "Time to count the game" with the opponent's name, the lobby's now-playing row and tab title say so,
  and the countdown reads in days and hours.


### 2026-10-04 · unit 4.10 follow-up · The game page drops its last chess styles
- Did: `ui/round` no longer imports `lib/css/chess/variant-style` (chessground's variant overlays) or
  `lib/css/component/material` (chess piece pictures); `_material.scss` keeps only the sizing of the
  prisoners row that reuses the `.material` grid areas. Deleted `_nvui.scss` and `build/round.nvui.scss`
  (the chess screen-reader page's styles; nothing loads `round.nvui` CSS since unit 3.18).
- Worked: all 19 game-page browser tests pass, including all 10 screenshot baselines, unchanged.
- Didn't work / dead ends: none.
- Lessons: `.material` is still the class the Go prisoners row sits in (`main.ts`), so the file stays
  with its layout rules; only the piece rules go.
- Decisions: none.
### 2026-10-04 · unit 9.7 part two · byo-yomi countdown sounds (`site.sound.byoyomi`)
- Did: added `makeByoyomiSounds()` in `ui/lib/src/game/clock/byoyomiSound.ts` (pure: which sound a byo-yomi clock tick plays) and `site.sound.byoyomi(periodsLeft, secondsLeft)` / `byoyomiReset()` over it. LowTime when byo-yomi starts or a period is used up, CountDown10 to CountDown1 over the last 10 s of each period, nothing when a new turn refills the period, per ADR 0026 section 2. The game page's call belongs to unit 4.10, which owns the period display; it has the API.
- Worked: 5 unit tests; ui tests 260+ pass. Every kept sound set already has CountDown0-10 and LowTime, so no new files.
- Didn't work / dead ends: none.
- Lessons: when another thread owns the page that will call a helper, ship the helper with its contract and let the owner add the one call; it avoids both threads editing the same view.
- Decisions: the first tick plays LowTime even after a page reload mid byo-yomi; simpler than tracking whether the page saw main time end.

### 2026-10-04 · unit 4.10 · the scoring phase and byo-yomi on the game page
- Did: libs/board's `mountBoard` takes `scoring` marks (dead stones, owner string, seal points,
  tappable) and reports taps on stones (`onScoreTap`); goban draws them in its "stone removal" phase,
  which libs/board sets directly. The round page handles 4.8's `scoring` and `resume` events, sends
  `score-toggle {p, v}`, `score-accept {v}` and `score-resume`, stops the clocks in the phase, and
  shows a panel in Pass's place: "Counting the score…", the tap hint, a "no proposal" note, the seal
  warning, the count table, who accepted, Accept score, Resume play and the time left to agree. A
  counted game shows `B+2.5` / Jigo with "Black wins by 2.5 points" and keeps its marks and count; a
  game never counted shows "No result". Byo-yomi periods sit beside each clock ("+5×30s" in main
  time, "5×30s" after), and the page starts the next period itself when one runs out.
- Worked: goban's own stone-removal drawing (translucent stone with a cross, territory squares,
  triangles) needed no drawing code; replacing `engine.toggleSingleGroupRemoval` on the instance
  turns its tap into a report without touching goban's tap handling, keyboard Enter included.
  The round e2e harness (unit 3.18) took scoring and byo-yomi games with two new options.
- Didn't work: the first browser run showed "Counting…" forever: the new controller methods were
  never registered as socket handlers (`socket.ts`). A unit test now sends both events through
  `socket.receive`.
- Tests: 4 libs/board browser tests (taps reported not marked, not tappable, Enter/P, marks
  removed), 12 controller tests, 4 byo-yomi tests, result/status tests, 7 round page browser tests
  (desktop and phone: proposal, toggle, accept, result; resume; reload mid-phase; periods rolling
  over) and two scoring-board screenshot baselines.
- Lessons: goban's stone removal needs only `engine.phase = 'stone removal'`, `engine.removal`,
  marks (`score`, `triangle`) and a `player_id` it counts as a player; never send its
  `game/removed_stones/set` path through a stand-in socket. The ADR 0020 wire doesn't say whether a
  byo-yomi side is still in main time.
- Review fixes: `goKomi` already existed in site.xml (lila wouldn't compile: duplicate val in
  key.scala), so the count table reuses it; a toggle or accept the server ignores no longer locks
  the panel (taps come back after 5 s); no Resume at the 1,000-ply limit; no "your turn" notice on
  the second pass; the board's cursor reads out "marked dead" and territory.
- Asked of Phase 4 and added to 4.8 (a141596): `inByo: {b, w}` in the byo-yomi clock JSON and clock
  events, so the page knows whether a side is still in main time; it guesses only if it's missing.
- Merged main after 4.8 landed: dropped `goBothPlayersPassed` and `goMoveLimitReached` (two passes now
  open the scoring phase; a game the server could not count says "Score not counted").
- Decisions: one line in logs/decisions.md.

### 2026-10-04 · unit 7.4 clean-up · The analysis board drops its last chess styles
- Did: for 3.19 part 2 (chessground and chessops gone), `ui/analyse` no longer imports `lib/css/chess/{promotion,
  variant-style,zh-pocket}` or `lib/css/component/material`. The crazyhouse build (`analyse.zh`) and the chess
  material styles in `_player-clock.scss` are deleted. The step-button styles the Go page does use moved from
  `lib/css/chess/_control.scss` to `lib/css/component/_analyse-controls.scss`; the old file now only forwards to it
  for the puzzle page (Phase 8's) until that imports the new one. Scala `AnalyseUi.miniSpan` (chessgroundMini, no
  callers) and `lib/game/nodePGN.ts` with its test (no callers left) are deleted; AnalyseUi left the chess-guard
  baseline.
- Worked: the 8 analysis screenshot pairs still match pixel for pixel, so the moved styles changed nothing.
- Lessons: before deleting a "chess" stylesheet, list its selectors and grep the page's views for them:
  `_control.scss` styled the Go page's own step buttons.
### 2026-10-04 · unit 9.7 part two · chess-only sounds and the 3D board preference deleted
- Did: deleted the sounds only chess uses (check-mate, berserk, explosion, out of bound, tournament places, new PM) and every `.ogg`/`.m3u` (lila plays only `.mp3`) from the four sound sets; `Error.mp3`, a link into the deleted `standard` set, now points at the set's `Check.mp3`. `sound.ts` no longer plays check/checkmate, the notify bell plays the generic notify sound, the game page no longer plays berserk. Removed lila's 3D board preference end to end (`Theme3d`, `PieceSet3d`, `is3d`/`theme3d`/`pieceSet3d` in prefs, forms, JSON and page attributes, the 3D board CSS and the Staunton pictures). ADR 0026 §2 and COPYING.md updated.
- Worked: ui build, verify, page browser tests (playground 47, game page 13, analysis board 15) all pass on main with #100 in.
- Didn't work / dead ends: chess piece and board pictures, blind mode and nvui stay: the chess puzzle page still uses them until unit 8.7 replaces it.
- Lessons: grep `Error.mp3`-style symlinks before deleting a sound set; they point across sets.
- Decisions: deletions per Danny's "yes, you can delete the chess leftovers" (2026-10-04).

### 2026-10-04 · unit 9.7 part two · lila's button blue reaches 4.5:1 under white text
- Did: added `--c-primary-button` (hsl(209 79% 44%), 4.84:1 under white) in `ui/lib/css/theme/_theme.default.scss`, used by `.button`, `%active-primary`, the rematch button's glow and hover, and every rule that filled a box with `$c-primary` (19 files). Links keep the lighter `--c-primary`, which needs that lightness to read on the dark background. The axe helper's let-off for white on #3692e7 and the game page's `.rematch` exclusion are gone; re-recorded the two account-page screenshots whose button changed.
- Worked: axe passes on the playground, the game page (20 repeats of the game page's check) and the analysis board with no exceptions.
- Didn't work / dead ends: a `//` comment naming `--c-primary` in the theme file broke the build: lila's theme generator turns every `--name` it finds, comments included, into a Sass variable.
- Lessons: never write a `--name` in a comment inside `ui/lib/css/theme/_theme.*.scss`.
- Decisions: one darker button blue for every theme rather than darkening `--c-primary` itself (links on the dark theme would then fail).

### 2026-10-04 · unit 9.7 part two (PR #92) · The push test sends its push again when CI's Chromium loses it
- Did: `ui/playground/e2e/pwa.spec.ts`'s push check failed on CI only (PRs #84, #87, #95): the worker was activated and reported no error, yet no notification showed in 5 s. The test now sends the same push up to three times, 3 s apart; the shared tag keeps it to one notification, and the failure message says how many pushes were sent. The page browser tests also post failures as CI annotations (Playwright's `github` reporter).
- Worked: 10 repeats of the PWA tests locally, 50/50. The job log (GitHub MCP `get_job_logs`) carried the test's own diagnostics, which named the failing test and the worker's states.
- Didn't work / dead ends: never reproduced locally, so the cause (a push delivered just as the worker activates being dropped) is inferred, not proven.
- Lessons: when a CI-only failure can't be reproduced, read the job log through the GitHub MCP; the plain API's log redirect is refused here.
- Decisions: retry the delivery, not the assertion: a worker that never shows the notification still fails.

### 2026-10-04 · unit 8.7 · The Go puzzle trainer page
- Did: `ui/puzzle` is a Go trainer on 8.5's `mountPuzzle`; goban's right and wrong events drive
  lila's flow (result, rating change, next puzzle, votes, session strip, replay). The source line
  sits under the board; "View the solution" replays the first right line through 7.2's
  `readTree`/`playFrom` into a move list and a stepper. Touch-confirm and the board theme come from
  the preferences. The controller's HTML actions are back (trainer, themes, daily, embed,
  dashboard, history, replay), replacing 3.16's placeholder. 12 unit tests (one replays the right
  line of all 240 puzzles), 12 behaviour tests and 10 screenshot tests at desktop and phone size,
  in `dev/ligo test pages` and the `ui` CI job.
- Worked: the board box follows the puzzle's `bounds`, so a corner puzzle fills a phone screen.
- Didn't work / dead ends: lila doesn't compile in the cloud, so CI is the Scala compile.
- Lessons: lila's `san` element sets moves in a chess font, so columns B, K, N, Q and R showed as
  chess pieces (the analysis board has the same issue). Playwright's `request.postData()` of an
  `xhr.form` body is multipart, not urlencoded.
- Decisions: hints dropped (goban marks no hint), a Confirm move button as on the game page, theme
  names sent by the server (logs/decisions.md, ADR 0025 amendment).
- Verified by Claude: UI build, lint, format, 255 unit tests, 22 Playwright tests, CI.
  · Needs owner verification: `/training`, `/training/themes`, `/training/dashboard/30`,
  `/training/history` on a computer and a phone; solve one, fail one, view a solution.
- Follow-ups: 8.8 (the demo); keyboard and screen-reader play for puzzles is not wired
  (`mountPuzzle` has no `access.ts`).

### 2026-10-04 · unit 7.4 fix · Go moves drawn as chess pieces
- Did: lila's move list writes moves in the Noto Chess figurine font, so moves in columns B, K, N, Q and R showed as pieces on `/analysis` ("B19" as a bishop; found by Phase 8's 8.7). The analysis move list and its menu's title now use the page font, as the game page's already did (3.18). The tree's header comment no longer points at `ui/puzzle/src/chessNode.ts`, which 8.7 deletes. A browser test plays B19, K18, N17, Q16 and R15 and checks the font of the list and the menu title.
- Worked: switching the rule off makes the test fail ("Noto Chess", "Noto Sans"), so it guards the fix.
- Didn't work / dead ends: none.
- Lessons: the glyph-hidden screenshots can't catch a font swap; check the computed font in a test.
- Decisions: none new.
- Verified by Claude: analysis browser tests 15/15; ui tests; oxlint, oxfmt, stylelint; verify.sh. · Needs owner verification: none.
- Follow-ups: none.

### 2026-10-03 · unit 9.7 part two (paused, not yet a PR) · Game page and analysis board words into lila's translations
- Did: moved the round page's and the analysis board's English words (about 60) into `translation/source/site.xml` as `go*` keys, reusing lila's keys where the meaning matched (Black, White, Black to play, Board, Cancel, Clear board); regenerated `key.scala` and `i18n.d.ts`. The analysis e2e page now picks the newest i18n bundle, as the round page's does. Paused on Danny's stop; WIP on branch `wip-9.7-part2-i18n`.
- Worked: ui tests 243/243, lint and format clean, page browser tests 47 + 13 + 14 pass.
- Didn't work / dead ends: a template literal to make `san` a string in tests trips oxlint; the tests convert with `String()` instead.
- Lessons: the unit tests' i18n stand-in returns a function named after the key, so tests compare `String(...)` with `site.<key>`.
- Decisions: none. Still open: Danny's yes/no on deleting the chess leftovers.

### 2026-10-03 · unit 9.7 part one review · Reviewer findings fixed (PR #84)
- Did: an independent review found nothing blocking; fixed its 5 should-fix and 4 of its 6 nits. 3D now always reads off on the server (`PrefHandlers`, `RequestPref`), since the menu lost its switch and a stored `is3d=true` would have kept lila's 3D board stylesheet squashing the Go board. A test keeps the three copies of the theme names in step (lila's lists, `libs/board`'s, the menu's swatch styles), and the menu's two panes are tested (list, `aria-pressed`, the `/pref/theme` and `/pref/pieceSet` posts, `<body>` and `board.change`). The stones pane reads "Stones" (English text of the `pieceSet` key). The public preferences JSON gives the Go name for a stored chess one. Night's swatch uses goban's own stone colours; the round controller test restores `<body>` in a `finally`; the test page escapes its attributes. Added the PR's row to docs/UPSTREAM.md (new project rule).
- Worked: reading the Scala lists in a node test with a regex, no Scala build needed.
- Didn't work / dead ends: none.
- Lessons: removing a UI switch doesn't remove the stored value behind it; neutralise it where it's read.
- Decisions: none new. Not changed: the chess thumbnail routes still pass the theme to lila-gif (moot until a Go renderer exists); the menu's "failed to save" toast stays English like upstream's.
- Verified by Claude: ui tests 267/267, round browser tests 13/13, oxlint, oxfmt, stylelint, lila scalafmt. · Needs owner verification: as in PR #84.
- Follow-ups: part two as listed in the entry below.

### 2026-09-30 · unit 9.7 part one (paused, not yet a PR) · Go themes in lila's preferences
- Did: lila's board (`theme`) and piece (`pieceSet`) preferences now hold goban's board and stone theme names (ADR 0026 §3); the account menu's Board and Piece set panes list them by name with a colour swatch, keep only the size slider, and drop the 2D/3D switch; the page no longer loads chess piece images or preloads a board picture (`PieceSetImages` removed). The game page draws its board in those preferences (read from `<body>`) and redraws when the menu changes them; `themeOf` in `libs/board/src/themes.ts` picks a still-offered name or the default (the playground uses it too and keeps its own stored choice). axe on the game page (desktop and phone, during and after a game) found the move buttons unnamed: they now have names (4 new `site` strings). New: a controller test, a preference-theme browser test, the accessibility test and 8 game-page screenshots.
- Worked: the playground's axe helper, shared as `ui/playground/e2e/axe.ts`, now prints a contrast failure's colours.
- Didn't work / dead ends: Rematch's colour changes as it glows, so an exact colour exemption failed 10 of 135 repeated runs; the game-page check leaves `.rematch` out until lila's colours are fixed.
- Lessons: an animated element can't be judged by exact colours; fix the colour or leave the element out, never allow-list a pair.
- Decisions: none new (ADR 0026 §3 and §4 as written).
- Verified by Claude: ui unit tests 263/263; round browser tests 135/135 over 15 repeats; playground a11y 3/3; oxlint, stylelint. Not yet: Scala compile (CI), /verify, review. · Needs owner verification: none yet.
- Follow-ups: finish part one (review, PR, merge) on "Continue"; part two: the game page's words in i18n, lila's colours site-wide (then drop the `.rematch` exclusion and the #3692e7 let-off), the chess sound files and board/piece pictures and 3D, the blind mode.

### 2026-10-03 · unit 7.4 review · Reviewer findings fixed
- Did: an independent review (1 blocking, 4 should-fix, 7 nits). Fixed:
  - COPYING.md had no note for `ui/analyse`'s new `@ligo/board` link, so CI's `meta` check would fail (paragraph added, as 3.18's).
  - The SGF box stopped following the tree once typed in, and a refused file's error stayed up while play went on: both now clear on every tree change.
  - Errors read "Move 2: move 2: ...": libs/board's message already carries the move, and the page now only capitalises it; the setup error names the point as the board does ("A9").
  - Every move remounted the board, so keyboard players lost focus after each stone: a move picked on the board is now played on it (`play`), and the board is drawn again only for other jumps. A browser test plays two moves by keyboard and fails without the fix (checked by switching it off).
  - `ReplayUi` still loaded the deleted `analyse.nvui` bundle (only chess games reach it): the tag and its helper went.
  - Komi: an invalid or empty value now goes back to the komi in use, within ±150.
  - Tighter tests: the full error texts, an `SgfError` match, an honest editor test name.
- Worked: switching a fix off to see its test fail; the first attempt (`|| true`) didn't take, a runtime condition did.
- Didn't work / dead ends: none.
- Lessons: a page that remounts goban for every position loses keyboard focus; answer the board's own move with `play`.
- Decisions: none new. Left as is: `loadFailed` stays until reload (the failure view replaces the board's element); "Load SGF" on an untouched box reloads the tree from the root; the now unused `userAnalysisJson` in round stays for 3.19 part 2.
- Verified by Claude: analysis browser tests 14/14, ui tests, tsc, oxlint, oxfmt, verify.sh. · Needs owner verification: none new.
- Follow-ups: none.

### 2026-10-03 · unit 7.4 · The analysis board page
- Did: lila's `/analysis` is a Go analysis board (ADR 0023 §1 and its 7.4 amendment). `ui/analyse` keeps lila's controller shape, inline move list with variations and comments, the move menu (promote, make main line, force variation, delete from here), keyboard and button navigation, wheel scrolling and autoplay, on libs/board: the board is `mountBoard`, remounted for each position shown (as the round page does); every move is replayed from the root by 7.2's `playFrom` with LiGo's settings, and a refused one says why ("suicide", "ko") under the Pass button. The SGF box under the board shows the tree as SGF, with Load SGF (paste), Open SGF file and Download SGF; a bad record is refused with its move number and the tree kept. "New position" opens setup mode: board size 9×9/13×13/19×19, rules, komi, who plays first, and Black/White stone tools on goban's own setup placement (wrapped in libs/board as `mountEditor`, with 6 browser tests); Start reads the position through `readTree`, so a stone without liberties is refused. `ui/lib/src/tree` is now generic over its node type; the chess node and its chessops code moved into `ui/puzzle` (its only user). lila's chess analysis parts went: chessground, the engine hooks, crazyhouse, motif, forecast, fork, the GIF dialog, nvui, the opening wiki, the socket, IndexedDB saving, PGN import/export, the settings dialog and the column view; the engine hook stays as one empty function. Old chess analysis links redirect to `/analysis`. Tests: 10 unit tests (`ui/analyse/tests/go.test.ts`), 5 browser tests and 16 screenshots at desktop and phone size (`ui/analyse/e2e`), run by `dev/ligo test pages` and the `ui` CI job.
- Worked: the round and playground harness pattern again (the built page served from lila/public by Playwright routing), and goban's puzzle-mode setup placement as the position editor, so no stone placement code was written.
- Didn't work / dead ends: a partial `ui/build analyse` doesn't rewrite `public/compiled/manifest.json`, so the test page loaded an older bundle; build the whole UI before the page tests. On a phone the setup panel was taller than lila's move-list grid row and the side panel covered its Start button; setup mode now lets the rows take their content's height. Clicks after using the SGF box missed the board because the page had scrolled; the test helpers scroll the board into view first. goban doesn't report a click on an occupied point at all, so "There is a stone there already" never shows from a click (it stays for completeness).
- Lessons: a Playwright accessible name includes an icon font's `data-icon` glyph, so `exact: true` on such a button fails; match its text instead. Look at text-visible screenshots before recording glyph-hidden baselines: the baselines hide exactly the problems words would show.
- Decisions: the inline-only numbered move list, setup mode's tools, what of lila's analysis page doesn't come back, the redirects, the generic tree (Claude, under the owner's 2026-09-28 delegation; logs/decisions.md, ADR 0023 amendment).
- Verified by Claude: ui unit tests 237/237; analysis browser tests 13/13 with the screenshots looked at (text visible and hidden); libs/board tests 371/371 (`dev/ligo test board`); tsc, oxlint, oxfmt, stylelint; `pnpm install --frozen-lockfile`; verify.sh (lila compile and lila tests included). Not verified: the page inside the real lila layout. · Needs owner verification: `dev/ligo up`, open localhost:8080/analysis on a computer and a phone: play a few stones and a pass, make a variation, paste an SGF, try New position.
- Follow-ups: 7.5 opens finished games here; 9.7 translates the page and gives it lila's theme preferences; 3.19 part 2 can drop chessground and chessops from `ui/analyse` (no imports left there; `ui/puzzle/src/chessNode.ts` still needs chessops until 8.7).


### 2026-09-30 · unit 3.18 merge · Main merged in; 3.13 and 3.14 landed first
- Did: merged main into PR #74 (it had a conflict in logs/decisions.md and the reviewer's memory index, which kept CI from running). Units 3.13 (#73) and 3.14 (#75) merged meanwhile, so the "land before 3.13 and 3.14" decision recorded in the review entry above no longer applies and was taken out of logs/decisions.md. Checked the page against what they shipped: lila-ws reads `d.u` as an SGF point or `pass` and `d.b` as blur (`ClientOut.scala`), the move event carries `p` or `pass: true`, `ply`, `cap`, `prisoners`, `phase`, `board`, `ko`, `clock`, `status`, `winner` (`game/Event.scala` GoMove), the round JSON's `game.go` block is as the page reads it (`game/JsonView.scala`), and two passes end the game as `UnknownFinish` with no winner (`MovePlayer.scala`).
- Worked: nothing to change in the page.
- Didn't work / dead ends: none.
- Lessons: a conflicted PR runs no `pull_request` CI at all; check `mergeable_state` when checks never appear.
- Decisions: none new.
- Verified by Claude: round unit tests, round browser tests, ui build after the merge. · Needs owner verification: a real game between two browsers is now possible (3.13 and 3.14 are in).
- Follow-ups: none.

### 2026-09-30 · unit 3.18 review · Reviewer findings fixed
- Did: an independent review (1 blocking, 4 should-fix, 6 nits) found: the early landing before 3.13/3.14 wasn't recorded (now in logs/decisions.md); a stone sent but not yet played back could be followed by a second one after looking back and forward (the remounted board forgot it was waiting), and one that never arrived stayed drawn when the game ended first (the old chess check read a turn that only flips on the server's echo). A `moveInFlight` flag now blocks moving and Pass until the server plays the move, and the end of the game remounts the board without an unsent stone. A move event whose ply doesn't follow the list fetches the game again; the list takes the ply from the event. A board that can't be drawn says so instead of going blank. Jumping to the start is read out as "Start". New: 4 controller tests (in-flight move, end before arrival, missed event, handicap) and a handicap browser test.
- Worked: a stand-in board that reports a pass only when it takes moves, like goban's, made the "pass after a sent stone" case visible.
- Didn't work / dead ends: none.
- Lessons: after a local move, "whose turn it is" in the round data only changes on the server's echo; track "sent, not yet played back" explicitly.
- Decisions: the early landing (logs/decisions.md). Left for later: the empty voice and kb-move grid areas and `.keyboard-move` rules in round, analyse and puzzle CSS, the unused keyboardMove/voiceMove pref fields in analyse and puzzle interfaces, and the dgt and keyboardMove i18n keys (9.7); `resolveConfirm` duplicates the playground's (libs/board and the playground are off-limits here); the round page isn't in the budget check.
- Verified by Claude: round unit tests 29/29; round browser tests 7/7; tsc, oxlint, oxfmt. · Needs owner verification: none new.
- Follow-ups: as above.

### 2026-09-30 · unit 3.18 · The game page plays Go
- Did: `ui/round` shows `libs/board` (goban) in place of chessground. A stone goes to the server as its SGF point and a pass as `pass` in `r/move` (`{u}`); the server's move event (ADR 0019 §6) plays the opponent's move, updates the prisoners (shown beside each player), the move list (points like E5, and Pass) and the Fischer clock. Pass sits under the moves, off when it isn't your turn; with Confirm moves (never, on touch screens, always) a tapped stone waits for Confirm or Cancel. Looking back through the moves remounts the board with fewer moves and no moving, as the playground's undo does. The game ends on resign, time or two passes ("Both players passed. Counting the score comes in a later version."), with results written B+R, W+T and so on. The board and stone themes chosen on the playground (9.3) apply, and goban's keyboard and screen-reader play (9.4) works. The chess-only move input went with chessground: the `ui/voice`, `ui/keyboardMove` and `ui/dgt` packages, their npm packages (vosk-browser, uuid), the DGT board page and its OAuth scopes, the voice and keyboard-move settings and help pages, and the round page's nvui (screen-reader) bundle. `ui/analyse` and `ui/puzzle` lost their hooks into those packages. Tests: 25 unit tests (`ui/round/tests`: the Go helpers and the controller with a stand-in board) and 6 Chromium tests (`ui/round/e2e`: a game at desktop and phone sizes against a stand-in game server, two passes, the keyboard and the themes), run by `dev/ligo test pages` and the `ui` CI job.
- Worked: the playground's test harness pattern (built page from lila/public, Playwright request routing) plus `page.routeWebSocket` for the game socket: the whole page runs without lila, Mongo or Redis.
- Didn't work / dead ends: lila's move list uses the chess figurine font, which drew B9 as a bishop; Go moves use the plain font. The trimmed test page first missed lila's icon font (declared inline by the layout), which hid the move buttons.
- Lessons: the round page asks lila for its side panel again at the end of a game (`/{id}/{color}/sides`); a stand-in server must answer it. A lila page's icon font is declared in `layout.scala`, not in any CSS bundle.
- Decisions: English words on the page until i18n (9.7); no board flip on the game page (the player sits at the bottom); the round page's nvui dropped (ADR 0026 §4: goban's own screen-reader play replaces it); themes from the playground's stored choice until lila's preferences carry Go themes (9.7); looking back remounts the board; the DGT board page removed with `ui/dgt` (Claude, under the owner's 2026-09-28 delegation; logs/decisions.md).
- Verified by Claude: ui unit tests (211 across ui, 25 in round); the 6 round browser tests; screenshots at desktop and phone size looked at; tsc (ui build), oxlint, oxfmt, stylelint; `pnpm install --frozen-lockfile`; verify.sh. Not verified: the Scala edits compile (strategygames download blocked in the cloud; CI compiles them); a real game against lila, which needs unit 3.13 (the server's Go moves) and 3.14 (lila-ws reading `u`). · Needs owner verification: after 3.13 and 3.14 merge, a real game between two browsers.
- Follow-ups: 3.14 must accept `{u: "dd"|"pass"}` in lila-ws's move message; 9.7 translates the page's words and moves the theme choice into lila's preferences.

### 2026-09-30 · UI build · Type-checking waits for the translation typings
- Did: `./ui/build` runs the translation step and tsc side by side (`ui/.build/src/build.ts`). The translation step rewrites the committed `@types/lichess/i18n.d.ts` in place whenever an XML source looks newer, and a fresh CI checkout gives files arbitrary times, so tsc could read it half-written and fail with "Cannot find name 'I18n'" (CI on PR #81). `i18n.ts` now exports a promise settled once its first typings pass has run (or at once when the build skips translations), and `tsc.ts` waits for it. The translation step's JavaScript output still runs alongside tsc.
- Worked: a local production build with a touched `translation/source/site.xml`: tsc started after the typings (1 s in) and passed, the translations finished at 6.6 s.
- Didn't work / dead ends: none.
- Lessons: a generated file that is also committed can be rewritten on any fresh checkout; whatever reads it must wait for the writer.
- Decisions: none new (a fix in lila's build script, marked "LiGo:").
- Verified by Claude: the production UI build (`./ui/build --no-install -p`), oxfmt, oxlint, the build tool's own type check. · Needs owner verification: none.
- Follow-ups: offer the fix upstream to lichess (its build has the same race).

### 2026-09-30 · unit 9.6 follow-up · The push test's lost notifications
- Did: the push tests (unit 9.6) failed now and then on CI (PRs #70, #71, #79): permission granted, worker activated, push delivered, yet `getNotifications()` stayed empty. A 20-run measurement on PR #81 lost 2 of 21 back to back, after which every run was ~30% faster: Chrome for Testing 153 first tries the desktop's notification service over D-Bus (CI's runner has none) and falls back to its own message centre. The page tests now start Chromium with `--disable-features=NativeNotifications,SystemNotifications`, so it uses the message centre from the start; the same 20-run measurement then passed 21 of 21.
- Worked: measuring on CI before and after (a temporary 20-run loop, removed before merge), and failure messages that print what the browser reported.
- Didn't work / dead ends: waiting for an activated worker (PR #71) was right but not the cause; nothing reproduced on the cloud's Chromium 141.
- Lessons: when a browser test flakes only on CI's browser, measure there with a repeat loop before and after the fix; a notification Chromium has "shown" isn't listed until the platform says it is displayed.
- Decisions: none new.
- Verified by Claude: CI, 21 of 21 push runs with the fix (2 of 21 lost without it); 43 page tests locally. · Needs owner verification: none.
- Follow-ups: lila's UI build can type-check before the translation typings exist (seen once on PR #81); make type-checking wait for them if it recurs.

### 2026-09-30 · unit 9.8 CI · Credits screenshots and a lost push
- Did: CI's `ui` job failed three page tests. The credits pictures differed in every line of text (~3% of the pixels): CI's Chromium 153 draws glyphs differently from the cloud's 141. The pictures now hide the credits page's glyphs, as the playground's already do (screenshot.css), and keep the layout; headings and links are still checked with locators. The "missing offline page" push test lost its push once: the page is controlled as soon as the worker claims it, inside its activate step, and a push sent before the worker is `activated` can be dropped. The test now waits for `activated`.
- Worked: the playground's existing glyph-hiding style, extended by a test-only class.
- Didn't work / dead ends: the lost push didn't reproduce locally (30 runs).
- Lessons: a text-heavy page can't be compared pixel for pixel across Chromium builds; hide the glyphs and check the text with locators. "Controlled" is not "activated" for a service worker.
- Decisions: none new.
- Verified by Claude: 43 playground browser tests; the push tests 30 times; oxlint, oxfmt, stylelint. · Needs owner verification: none new.
- Follow-ups: none.

### 2026-09-30 · unit 9.8 review · Reviewer findings fixed
- Did: an independent review found the COPYING check could pass without checking: a reworded §3 heading made it read nothing, a symlinked path skipped the whole check, and "contains" matching let a dependency row through on its parent's name; odd rows and non-`.json` puzzle files were skipped. Fixed: the check fails on a missing section, an unreadable row or no rows; a row is covered only when its first cell starts with an entry's name; the script finds itself by real path; puzzle files are read from every row; entries need every field. `lila/bin/gen/credits.test.mjs` (8 tests) covers each case, and `dev/tests/run.sh` runs it plus the check through a symlinked folder. Also: Noto Sans and Roboto credited under the SIL OFL 1.1 (lila's COPYING.md's Apache-2.0 is out of date; the shipped Roboto names the OFL-era roboto-classic project), the full-size and g170 KataGo networks listed apart (different licences), and meta.yml sets up Node before the tooling checks.
- Worked: node:test for the check's own parsing, next to the script.
- Didn't work / dead ends: none.
- Lessons: a drift check needs negative tests for its own parsing (a missing section, odd rows), not only for a mismatch; credits copied from upstream's COPYING inherit its stale licence claims.
- Decisions: none new.
- Verified by Claude: dev/tests/run.sh 63 passed; credits.test.mjs 8 passed; 43 playground browser tests; oxfmt, oxlint, scalafmt. · Needs owner verification: the external links (none reachable from the cloud session).
- Follow-ups: tell lichess (or tidy lila/COPYING.md in 9.7) that its font licences are out of date.

### 2026-09-30 · unit 9.8 · The credits page
- Did: `docs/credits.json` lists who and what LiGo is built from (lichess, lishogi, strategygames, OGS goban and goratings, goscorer, KataGo and its networks, @sabaki/sgf, the sound sets, fonts, icons and flags, the puzzles and KaTrain's frame, the scoring and tool libraries, axe-core), each with author, use, licence and link. `lila/bin/gen/credits.mjs` writes it as `lila/public/credits.html`, which lila serves at `/credits`; the site menu, the home page's About links and `/source` link to it. `--check` (in `dev/tests/run.sh`) fails on a stale page, a COPYING.md §3 third party no entry covers, or a puzzle file without an entry. `ui/playground/e2e/credits.spec.ts` screenshots the page at desktop and phone sizes, runs axe, and checks every entry's link.
- Worked: one generated HTML body lets the Scala page and the browser test show the same thing without a lila server.
- Didn't work / dead ends: axe found lila's link blue (3.96:1) and dim text (4.27:1) too faint on the table's zebra rows, and a colour-only link in the intro; the page drops the zebra rows and underlines its links.
- Lessons: a list checked against COPYING.md by names each entry claims is simple and catches a new dependency the credits forgot.
- Decisions: the list as JSON in docs/ with a generated page body; English words; no zebra rows (Claude, under the owner's 2026-09-28 delegation; logs/decisions.md, ADR 0026 §6 amendment).
- Verified by Claude: the two credits browser tests (screenshots looked at), `credits.mjs --check` and its negative test in dev/tests/run.sh (62 passed), oxfmt, oxlint, stylelint, scalafmt. · Needs owner verification: open localhost:8080/credits after `dev/ligo up`, and the Credits links in the menu, on the home page and on /source.
- Follow-ups: 9.7 fixes the link contrast site-wide; the credits list grows with each unit that adds a third party (the check enforces it).

### 2026-09-30 · unit 9.6 review · Reviewer findings fixed
- Did: an independent review found the push test passing only in full Chromium (CI's default headless shell shows no notifications), the ADR's "push still subscribing" not matching the check, a failed `/offline` cache never retried, the install offer missable (watched in an idle callback) and lost for good after an uninstall. Fixed: the PWA tests run on Chromium's `chromium` channel; the ADR amendment says what push check is made; the worker re-caches a missing `/offline` after any page that loads, with a test (404 at install, push still shows, then cached and shown offline); `watchInstall` runs at boot; a live offer wins over a stored "installed"; the menu redraws even if the dialog fails; the offline page gets a `<main>`.
- Worked: `channel: 'chromium'` resolves to the full Chromium build that `playwright install chromium` fetches alongside the headless shell.
- Didn't work / dead ends: `test.use({ channel })` inside a describe block is refused (it forces a new worker); it is file-level.
- Lessons: run browser-feature tests (notifications, installability) on the browser CI launches, not the cloud's full Chromium; a service worker's install-time cache only refreshes when the worker's bytes change.
- Decisions: none new.
- Verified by Claude: 41 playground browser tests; 6 install tests; oxfmt, oxlint. · Needs owner verification: how the "Install LiGo" menu entry looks, and push subscribing on a real browser.
- Follow-ups: none.

### 2026-09-30 · unit 9.6 · The installable app
- Did: lila's manifest is LiGo's (name, description, `id`, dark-theme colours, a new maskable icon, no store apps); the service worker caches a self-contained offline page (`public/offline.html`, served at `/offline`) and shows it when a page can't load, with navigation preload so pages are no slower; it registers wherever service workers exist; `lib/install.ts` keeps the browser's install offer and the account menu shows "Install LiGo" (or iOS's Share instructions) until installed or dismissed; the board sets `touch-action: manipulation` and takes a phone's full width on the playground. `ui/playground/e2e/pwa.spec.ts` checks, at phone size in Chromium: no installability errors, the offline page when the server is down and the page back after "Try again", a push message still showing its notification, and the board's width.
- Worked: a tiny local server in the test (with lila's `Service-Worker-Allowed` header) and `ServiceWorker.deliverPushMessage` over the DevTools protocol test the real built worker without lila running.
- Didn't work / dead ends: `Page.getInstallabilityErrors` reports `in-incognito` for Playwright's normal contexts; the test uses a persistent profile. Play's asset controller serves nothing in prod mode, so `/offline` reads the file itself. lila's Scala can't compile in cloud sessions since 3.10 (strategygames download blocked), so `StaticContentTest` and `Main.offline` are checked by CI only.
- Lessons: to test a service worker, serve a real origin (localhost); Playwright's request routing doesn't reach the worker.
- Decisions: the offline page as one static file at `/offline`; the worker registers without push support; English install text (Claude, under the owner's 2026-09-28 delegation; logs/decisions.md, ADR 0026 §1 amendment).
- Verified by Claude: the 40 playground browser tests (4 new; 17 phone screenshots re-recorded for the full-width board and looked at); `lib` install tests; the budget (site JS 76.9 KiB, playground JS 80.8, CSS 0.6); oxfmt, oxlint, stylelint, scalafmt; dev/tests/run.sh. · Needs owner verification: on your phone, open the site, install it from the account menu (Android) or Share → Add to Home Screen (iPhone), then turn on flight mode and open a page.
- Follow-ups: 9.7 gives lila's other board pages the full-width phone board; 9.10 installs it on a phone.

### 2026-09-30 · unit 9.5 review · Reviewer findings fixed
- Did: a missing or mistyped limit in `budget.json` now fails the check (it had passed as "ok": `x > undefined` is false); a referenced chunk missing from the build fails instead of being skipped; the board's size includes any chunk it imports that no page already loads; the mount is timed inside the page (click to new board painted), not through Playwright's round trips, which had doubled it. Re-measured: median 63–76 ms over three runs, so the limit is 250 ms (ADR 0026 §5 amendment corrected; this replaces the 130 ms / 300 ms above). `dev/ligo test budget`'s usage says it leaves a minified build and isn't part of `test all`; a changed.sh self-test for the budget files.
- Worked: the manifest lists shared chunks and inline scripts too; walking only entries with a hash reaches exactly the current build's files.
- Didn't work / dead ends: a first walk through every manifest key tried to open `lib.X.undefined.js` (shared chunks carry no hash).
- Lessons: time browser work inside the page; a limit read from JSON must be checked to exist before it is compared.
- Decisions: mount limit 250 ms (Claude, under the owner's 2026-09-28 delegation; logs/decisions.md).
- Verified by Claude: `budget.mjs` passes on the production build and exits 1 with a mistyped limit; budget.spec 3 runs pass (medians 73, 63, 76 ms); `dev/tests/run.sh`. · Needs owner verification: none.
- Follow-ups: none new.

### 2026-09-30 · unit 9.5 · The performance budget check
- Did: `dev/ci/budget.mjs` measures, gzip -9, the board chunk (goban + libs/board, found by following the chunks the manifest's entries import), lila's site JS and CSS, and each LiGo page's JS before the board and its own CSS (the playground now), against `dev/ci/budget.json`; `ui/playground/e2e/budget.spec.ts` times a 19×19, 9-stone board mount with Chromium's CPU slowed 4× (median of five). The `ui` CI job runs the size check after its production build and the mount test with the page tests; `dev/ligo test budget` does both locally (production build first).
- Worked: following static chunk imports from the manifest finds exactly one board chunk even when `public/compiled` holds stale files from earlier builds.
- Didn't work / dead ends: a first pass matched every file carrying goban's code and found four (old debug builds). The ADR's "Today" sizes came from a debug build, 30% bigger than CI's minified one; the limits are set from the production build instead (ADR 0026 §5 amendment).
- Lessons: measure budgets on the build CI makes (`ui/build -p`), never on `dev/ligo compile ui`'s debug build.
- Decisions: limits from the production build + ~15%; mount limit 300 ms rather than +15% because CI runners' timings vary (Claude, under the owner's 2026-09-28 delegation; logs/decisions.md, ADR 0026 §5 amendment).
- Verified by Claude: `dev/ligo test budget` on main with 9.4: board 100.3 KiB, site JS 77.5, site CSS 13.4, playground JS 81.4, playground CSS 0.5, all within limits; mount median 130 ms (114–178); lowering one limit below its size makes `budget.mjs` exit 1. · Needs owner verification: `dev/ligo test budget` in native mode, if you like.
- Follow-ups: pages from 3.18, 6.x, 7.4 and 8.7 add their own line to `budget.json`; 9.10 runs the whole set.

### 2026-09-29 · unit 9.1 · ADR 0026: PWA, sounds, themes, accessibility, budget, credits, handoff
- Did: ADR 0026 for Phase 9.
- Worked: lila's four kept sound sets (sfx, piano, nes, futuristic) each already have Move,
  Capture, Confirmation, Error, GenericNotify, LowTime, CountDown0–10 and Victory/Defeat/Draw, so
  every Go event maps onto an existing file. goban draws five boards and six stone styles from code
  alone.
- Didn't work / dead ends: no licence-checked stone-click sounds are reachable from the cloud
  (freesound and opengameart time out; OGS's packs sit on its CDN with no licence); goban's wood,
  granite and anime themes load unlicensed pictures from OGS's CDN.
- Lessons: lila's manifest is built in Scala (`StaticContent.manifest`), not a static file; its
  service worker caches nothing. Built sizes today (gzip -9): site JS 107 KiB, playground with site 112 KiB (own entry 3.6 KiB),
  board chunk 142 KiB.
- Decisions: all of ADR 0026, Claude's calls under the owner's 2026-09-28 delegation
  (logs/decisions.md); dropping lila's blind mode is recorded there.
- Verified by Claude: verify.sh; reviewer agent pass (1 blocking: axe-core is MPL-2.0, not on the licence list; 3 should-fix; all addressed). · Needs owner verification: whether dropping
  blind mode and shipping no Go stone-click sound are acceptable.
- Follow-ups: 9.2 to 9.5.

### 2026-09-29 · Phase 9 breakdown · PWA, polish and handoff split into units 9.1–9.10
- Did: split Phase 9 into 10 units (docs/PLAN.md §5, "Phase 9 units"): a design ADR (9.1), sounds
  (9.2), board themes (9.3) and board accessibility (9.4) in `libs/board` and the playground, a
  performance budget check (9.5), then the lila halves: the PWA (9.6), themes, sounds and
  accessibility on lila's pages (9.7), the credits page (9.8), the handoff package (9.9) and the
  demo (9.10).
- Worked: lila already has a manifest (`StaticContent.manifest`), a service worker (web push only),
  sound sets with a preference, site themes and a non-visual mode, so the lila units adapt them; the
  board halves can be built now on the playground page.
- Didn't work / dead ends: none.
- Lessons: lila's manifest still names lichess and lists lichess's store apps, and its service
  worker does push only (no offline page); its non-visual mode (`ui/lib/src/nvui`) is chess-only.
- Decisions: the split itself, Claude's call under the owner's 2026-09-28 delegation
  (logs/decisions.md).
- Verified by Claude: verify.sh. · Needs owner verification: whether the split reads right.
- Follow-ups: 9.1 next, then 9.2 to 9.5.

### 2026-09-29 · unit 7.1 · ADR 0023: analysis board, SGF import and export, correspondence
- Did: ADR 0023 for Phase 7 and a build-vs-buy memo for the server's SGF reader
  (docs/build-vs-buy/server-sgf-reader.md); the `sgf` skill names that reader as its one exception.
- Worked: lila's tree operations (`ui/lib/src/tree` `ops.ts`, `tree.ts`) are game-neutral and
  `path.ts` only needs two-character ids, which an SGF point already is, so the analysis board can
  keep them unchanged.
- Didn't work / dead ends: no maintained JVM SGF reader (strategygames only writes SGF; sgf4j's
  last Maven release is six years old and pulls in log4j). goban-engine's SGF reader, the first
  plan for the browser, was dropped after the reviewer found it hangs on a truncated file, plays
  moves unchecked, turns off-board points into passes and ignores glyphs; `@sabaki/sgf` (ADR 0014's
  fallback) reads and writes lila's tree instead.
- Lessons: goban's `MoveTree.toSGF` writes no root properties; keep one tree (lila's) and use
  goban only for positions. lila hashes the whole PGN text for import dedup, not the moves.
- Decisions: all of ADR 0023, Claude's calls under the owner's 2026-09-28 delegation
  (logs/decisions.md); the removal of forecasts is recorded there.
- Verified by Claude: verify.sh; a reviewer agent pass (3 blocking, 7 should-fix findings, all
  addressed in the ADR). · Needs owner verification: whether dropping forecasts and keeping the
  opt-in email are the right calls.
- Follow-ups: 7.2 and 7.3 next.

### 2026-09-29 · Phase 7 breakdown · Correspondence, SGF and analysis split into units 7.1–7.8
- Did: split Phase 7 into 8 units (docs/PLAN.md §5, "Phase 7 units"): a design ADR (7.1), the
  analysis tree over goban-engine in `libs/board` (7.2), the server's SGF reader in `libs/go-rules`
  (7.3), then the lila halves: the analysis board page (7.4), SGF import and game analysis (7.5),
  correspondence on the server (7.6) and in the UI (7.7), and the demo (7.8).
- Worked: lila already has the analysis board and move tree, `/paste` import, the days-per-move
  clock, `CorresAlarm`, `notify` and `push` (all kept by ADR 0018), so the lila units adapt them;
  the SGF halves live in the two rules libraries, which nothing else is changing, so they can be
  built before the fork.
- Didn't work / dead ends: none.
- Lessons: lila's analysis page (`controllers.UserAnalysis`, `ui/analyse`) also hosts forecasts
  (correspondence conditional moves, stored as UCI lines), so whether forecasts survive is a
  correspondence question for 7.1, not an analysis-board detail.
- Decisions: the split itself, Claude's call under the owner's 2026-09-28 delegation
  (logs/decisions.md).
- Verified by Claude: verify.sh. · Needs owner verification: whether the split reads right.
- Follow-ups: 7.1 next, then 7.2 and 7.3.
