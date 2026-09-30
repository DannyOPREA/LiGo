# Board UI log

## Lessons (curated, ≤ 30 lines — read this first)
- chessground is built around square cells and pieces; PlayStrategy drawing Go on it is awkward. Plan: wrap OGS goban's SVG renderer (2026-09-25, planning research).
- Avoid jgoboard (CC BY-NC); Shudan (MIT, Preact) is the fallback (2026-09-25, planning research).
- goban's SVG renderer mounts in a snabbdom `insert` hook (`new SVGRenderer({board_div, ...})`, `destroy()` in the destroy hook). In play mode it sends moves over OGS's protocol and needs an OGS clock first: subclass it and override `sendMove`, and feed server moves in as `game/<id>/move` events on a stand-in socket. Set `square_size` from the container width; "auto" draws a tiny board (2026-09-27, 1.2).
- goban's rule presets are OGS's, not ours: pass `allow_superko: false, superko_algorithm: "ssk"` and the komi for every game. Its superko check looks back only 30 moves, and its SGF reader ignores `SZ`, `KM` and `PL`. Given `handicap: N` it places its own stones (free placement under its Chinese preset) and cuts komi: always pass the server's stones as `initial_state` with `handicap: N` (spec §9: goban then places none itself and keeps the Chinese compensation), and komi (2026-09-27, 1.2; handicap value corrected in 1.8).
- goban bundles goscorer (MIT, lightvector) and its minified builds drop that notice; `pnpm licenses` only sees Apache-2.0. COPYING.md carries goscorer's notice by hand (2026-09-27, 1.2).
- npm `goban` is a pre-built bundle (no tree-shaking): ~104 KB gzipped vs chessground's 12 KB; its npm releases lag `main` by months (2026-09-27, 1.2).
- goban sets the width of the element it draws in and draws inside a shadow root: mount it in a child of the element the page sizes, and find its svg with Playwright locators, not `querySelector` (2026-09-28, 2.1).
- goban turns stone placement off after `sendMove` returns: report the move from `sendMove` in a microtask so a page can play it back at once. goban's `onError` skips suicide; wrap `errorHandler` for every refusal (2026-09-28, 2.1).
- goban's default theme (no `getSelectedThemes` callback) is Kaya/Slate/Shell and loads a board picture from OGS's CDN: LiGo overrides `getSelectedThemes`. goban calls it inside its constructor, before a subclass's fields exist, so the chosen theme has to reach it another way (a static set just before `super`). Shell stones are canvas drawings placed as `data:` images: test for non-`data:` images, not for none (2026-09-28, 2.1; 2026-09-30, 9.3).
- libs/board is in lila's pnpm workspace: run its scripts from `lila/` with `--filter @ligo/board`; `pnpm run` inside libs/board starts a lockfile of its own (2026-09-28, 2.1).
- Don't list lila's lint tools again in libs/board: its oxlint resolved without lila's optional `oxlint-tsgolint` peer, a second lockfile entry that a full install never unpacks, so `pnpm licenses` read its licence as Unknown. The board uses lila's own oxfmt/oxlint; install with `--filter @ligo/board --filter lila` (2026-09-28, 2.1).
- goban's `pass()` leaves stone placement on, and its `updateTitleAndStonePlacement` turns it off whenever a preview is shown: an adapter must keep "a move is waiting" state of its own (2026-09-28, 2.1 review).
- A board box that goban measures needs an explicit width: `margin: 0 auto` on a flex item shrinks it to its content (the loading text), and goban then draws a tiny board (2026-09-28, 2.2).
- snabbdom: bind an input's shown value with `props: { value }`, not `attrs`; `attrs.value` is only the default and stops showing once the user has typed (2026-09-28, 2.2 review).
- goban's confirm mode: a second tap on the preview removes it, and double taps on touch screens are ignored; phones need a confirm button calling `board.confirm()` (2026-09-28, 2.3).
- Screenshot tolerance as a pixel count, not a share of the page: a whole stone is ~0.15% of a 1280×800 page. Serve a page's CSS as lila does (`lib.theme.all` + `site` + the page's own), or it renders unstyled (2026-09-28, 2.4).
- Chromium builds rasterise web-font text differently (~2,300 px per page between 141 and 153); board SVG matched. Hide page text in screenshots (`stylePath`) and check it with locators (2026-09-28, 2.4 CI).

## Entries (newest first)

### 2026-09-30 · Unit 8.5 · The puzzle board: goban's puzzle mode in libs/board
- Did: `mountPuzzle` (`libs/board/src/puzzle.ts`, exported as `@ligo/board/puzzle`) mounts goban's
  own puzzle mode with LiGo's rules and 9.3's themes: the puzzle's setup, bounds and tree, the
  opponent's reply played by goban, `onResult` once per attempt, `retry`, `line`, touch-confirm.
  `test/puzzle.browser.test.mjs` plays every puzzle in `tools/puzzles/data/` in Chromium (a right
  line to the end and a wrong first move) plus 11 tests of what LiGo adds; changed.sh runs the
  `rules` job when the puzzle set changes.
- Worked: goban's puzzle mode needed no patching: `getPuzzlePlacementSetting` in the config
  returning `{mode: 'play'}`, `bounds`, `move_tree` and the two answer events. All 240 puzzles
  replay right and wrong in 24 s.
- Didn't work / dead ends: returning any mode other than "play" to stop goban placing (for
  touch-confirm) makes goban highlight the tree's moves, showing the answer. Touch-confirm instead
  keeps goban's stone placement off (overriding `updateTitleAndStonePlacement`, which goban calls
  after every move in puzzle mode), reads the tap itself (`pointerup`, goban's `xy2ij`), shows a
  see-through stone as a goban mark, and hands the confirmed tap to goban's `tapAt`.
- Lessons: goban says "wrong" again at every later move of a failed line, and its reply timer
  can't be cancelled: report the first result only and stop moves, and let a retry wait for a
  pending reply. goban reads `puzzle_autoplace_delay: 0` as its default 300 ms. With `bounds`,
  goban draws labels only on the board's own edges.
- Decisions: touch-confirm glue (a second tap plays), one result per attempt, and a separate
  `mountPuzzle` instead of PLAN/ADR 0025's "`mountBoard` gains a puzzle option"
  (logs/decisions.md; Claude, under the owner's 2026-09-28 delegation).
- Review: 2 blocking, both fixed: a retry during a pending reply let the abandoned attempt's
  reply and "wrong" reach the page (goban places the reply and fires its answer events in one
  synchronous call, so a microtask restart came too late: events are now dropped while a retry
  waits); the separate mount wasn't recorded. Non-blocking fixed: refusal docs (a click on a stone
  does nothing, puzzle mode never checks superko), stronger retry, click-on-stone and wrong-move
  tests, `replyDelay: 0`, the rules workflow's header.
- Verified by Claude: typecheck, lint, the Chromium tests (every puzzle, and 11 more including
  phone taps), `dev/tests/run.sh`, verify.sh (every gate but go-rules + board, whose strategygames
  download the cloud proxy refuses; CI's rules job runs the board tests). · Needs owner
  verification: none now; touch-confirm on a real phone comes with the trainer page (8.7).
- Follow-ups: 8.7 (the trainer page) mounts it; sounds (9.2) can hang on `onMove`.

### 2026-09-30 · unit 9.4 review · Reviewer findings fixed
- Did: a held Enter, Space or P now acts once (key repeat let Confirm moves be skipped and passed twice); P out of turn says "Not your move"; the board says "Waiting for the move to count" while the page hasn't answered; Escape takes back a preview; Tab names the point under the cursor; the board's keys stop at the board so lila's mousetrap hotkeys don't also fire (round, analysis, puzzle pages); the name reads "9 by 9, Go board" instead of saying "Go board" twice; "Up" capitalised. The playground's axe exemption now matches only white on #3692e7. Tests: the vacuous click test now checks what happens (a click doesn't focus the board; Shift+Tab does), plus cursor position with and without coordinates, repeated words, key repeat, Escape and moving the preview, P out of turn, waiting, page hotkeys, and every keyboard test checks for page errors. 41 board browser tests.
- Worked: a mutation check (key repeat guard off) fails the new test.
- Didn't work / dead ends: after a click, Tab goes past the board (the click set the Tab starting point inside it); Shift+Tab reaches it.
- Lessons: key handlers that act must ignore `e.repeat`; a click never focuses goban's board.
- Decisions: Escape takes back a preview (Claude, under the owner's 2026-09-28 delegation; ADR 0026 §4 amendment).
- Verified by Claude: board browser tests 41/41; `dev/ligo test pages` 35/35; lint, typecheck. · Needs owner verification: as in the entry below.
- Follow-ups: none new.

### 2026-09-30 · unit 9.4 · Keyboard and screen-reader play on the board
- Did: `libs/board` gets keyboard play (Tab focuses the board; arrows, Home/End, Page Up/Down move a two-tone cursor; Enter or Space plays there through goban's own tap handling, so Confirm moves previews first and a second Enter plays; P passes; D reads the point and its four neighbours) and a polite live region that reads out each move played ("Black D4", "White passes", "Black A8, 1 stone captured"), refusals ("Illegal: ko", "Illegal: suicide", "Illegal: D4 is occupied"), "Not your move" and the point under the cursor. The board is a focusable `role="application"` with a name and a hidden help text. Point names are the printed ones (`src/access.ts`, letters without I). axe-core (`@axe-core/playwright` 4.13.0, MPL-2.0) runs in the board's browser tests and a new playground page test (desktop and phone); MPL-2.0 joined the allowed licences (`dev/ci/meta_checks.py`, PLAN §2.2, COPYING.md) as ADR 0026 §4 decided.
- Worked: goban's protected `tapAt` gives the keyboard exactly a click's behaviour (previews, the preview moving, captures); the cursor shows only on keyboard focus (`:focus-visible`, or any board key), so no screenshot baseline changed. goban draws no stone animation, so reduced motion needs nothing.
- Didn't work / dead ends: a second `pnpm add -w` in the same session wrote the root importer's entry without its `(playwright-core@…)` peer suffix, so the frozen install linked a folder that didn't exist; fixed by hand in the lockfile and checked with `pnpm install --frozen-lockfile`. axe flags lila's own `.button` (white on #3692e7, 3.3:1) on the playground: lila's site-wide colour, left to 9.7; the page test lets off only that rule on lila's buttons.
- Lessons: goban has no keyboard support; drive its `tapAt` rather than re-creating previews.
- Decisions: keys P and D, the cursor's two-tone ring, English words until lila's i18n reaches the board (9.7), lila's button contrast left to 9.7 (Claude, under the owner's 2026-09-28 delegation; logs/decisions.md, ADR 0026 §4 amendment).
- Verified by Claude: board browser tests 33/33 (9 new, axe included); `dev/ligo test pages` 35/35 (3 new); lint, typecheck, js-licences. · Needs owner verification: a keyboard-only game and a screen-reader pass (Orca on Fedora) on /playground.
- Follow-ups: 9.7 fixes lila's button contrast and moves the words into lila's i18n; 3.18/7.4/8.7 pages get the same keyboard board for free.

### 2026-09-30 · unit 9.3 · Board themes
- Did: `mountBoard` takes `theme: { board, stones }` and `set({ theme })` changes it live; the
  offered names are goban's picture-free themes (5 boards, 5 stone pairs, `src/themes.ts`, loadable
  without goban); any other name becomes Plain (`gobanThemes`). The playground has a "Board look"
  box (Board, Stones) that applies at once and is remembered in the browser until 9.7 moves it to
  lila's preferences. Three board tests (all 25 pairs draw differently with no request and no
  non-`data:` image; picture or unknown names fall back; `set` changes and restores the look), two
  controller tests, 18 new board screenshots (each theme, desktop and phone) and a reload test; the
  8 page screenshots re-recorded for the new box.
- Worked: goban's `setTheme(themes, false)` redraws a mounted board in place, stones kept.
- Didn't work / dead ends: storing the theme in a subclass field: goban asks for it inside its
  constructor, before the field exists (every board test failed until a static carried it).
- Lessons: promoted (goban reads themes in its constructor; Shell stones are `data:` images).
- Decisions: none new (ADR 0026 §3). Slate & Shell is one choice, as goban pairs them.
- Verified by Claude: `pnpm --filter @ligo/board run test:browser` 23/23, `node ui/test playground`
  19/19, `dev/ligo test pages` 32/32, verify.sh (go-rules gate can't fetch strategygames in the
  cloud; CI runs it). · Needs owner verification: whether the themes look right to you on the
  playground (desktop and phone).
- Follow-ups: lila's board preference and the dasher menu offer these themes in 9.7.

### 2026-09-29 · unit 9.2 · Sounds on the board and the playground
- Did: `mountBoard` reports each move that counted as `onPlayed({ move, color, captured })`, from
  `play` only; the playground plays lila's sounds for it (Move, Capture, Confirmation for a pass,
  Error for a refused move) through `site.sound`, so the sound preference and volume apply (ADR 0026
  §2). Two board tests in Chromium, a controller test, and the playground's scripted game now checks
  the sounds in order.
- Worked: the captured count is the mover's prisoner count after the move minus before, read from
  the position goban has played, so it needs nothing from goban's sound events.
- Didn't work / dead ends: goban's own `audio-capture-stones` also fires when a stone is only
  previewed, and it `console.log`s every capture, so it isn't forwarded.
- Lessons: the playground's page test serves a trimmed page without lila's site module;
  `site.sound` has to be stubbed there (it records the names played).
- Decisions: none new (ADR 0026 §2).
- Verified by Claude: `pnpm --filter @ligo/board run test:browser` 20/20, `node ui/test playground`
  17/17, `dev/ligo test pages` 10/10, verify.sh (go-rules gate can't fetch strategygames in the
  cloud; CI runs it). · Needs owner verification: that the sounds play on the playground on your
  box with the sound set of your choice.
- Follow-ups: byo-yomi, game start/end and scoring-phase sounds come with the round page (9.7);
  with the "speech" sound set lila plays nothing for Move/Capture, so stones are silent there until
  9.7 speaks coordinates. Reviewer: no blocking finding; a click on a stone stays silent (goban
  ignores it), so ADR 0026 §2's table now says so, and a playground test plays a real suicide.

### 2026-09-28 · 2.4 CI (2) · Board and page pictures
- Didn't work: with the text hidden, 5 of 8 pictures still failed on CI by 110–120 pixels, all at
  button edges (Pass/Undo, New game): lila's buttons are as wide as their text, and the two Chromium
  builds measure text slightly differently.
- Done: each state now takes two pictures. The board alone is held to 100 pixels (the painted-out
  stone fails it, 1,487), and the whole page is allowed 600 for layout (a lost button or a moved
  panel is thousands). 16 baselines.

### 2026-09-28 · 2.4 CI · Screenshots on CI's Chromium
- Didn't work: all 8 pictures recorded with the cloud's Chromium 141 differed on CI's Chromium 153
  by 2,200–2,400 pixels. CI's artifacts can't be downloaded from a cloud session (the proxy refuses
  Azure blob storage), so CI now prints a grid of where a diff picture's red pixels are
  (`e2e/diffmap.mjs`). Every differing cell was page text (title, intro, side panel, form); the
  board, its coordinates and the stones matched.
- Done: while a screenshot is taken, `e2e/screenshot.css` makes the page's text transparent
  (Playwright's `stylePath`), so the pictures compare layout, boxes, buttons and the board; the text
  is checked by locators. A painted-out stone still fails (1,487 pixels).
- Found a real bug through it: with Confirm move on, the three buttons overflowed the 280px desktop
  panel; `.playground__controls` now wraps.
- Rebuilt the ui after merging main before re-recording: baselines must come from the branch's own
  build, not an older `public/`.

### 2026-09-28 · 2.4 review · Reviewer findings fixed
- Blocking, fixed: Playwright writes `test-results/` and its html report next to the nearest
  package.json (`ui/playground/`), not next to the config, so CI's failure upload would have been
  empty; the config now sets `outputDir` and the report's `outputFolder`. A PR changing only
  libs/board skipped the `ui` job and so the screenshots; `dev/ci/changed.sh` now counts libs/board
  for ui too (its dev/tests check updated).
- Also fixed: `dev/ligo test all` skips the page tests instead of stopping when the ui isn't built;
  the demo says a new local account's confirmation link is in `dev/ligo logs lila`; oxfmt had moved
  an import above two files' header comments (a blank line after the header keeps it there).
- Left, disclosed: /verify has no gate for the page tests; `ui_built` doesn't notice a stale build;
  the refused-move check can't catch a move that lands late (a later Undo would on desktop).
- Merged main (1.9 and the Phase 4 breakdown landed): STATUS and decisions conflicts, both kept.

### 2026-09-28 · 2.4 · Visual snapshots and the Phase 2 demo
- Done: Playwright tests in `lila/ui/playground/e2e/`: 8 screenshots (desktop 1280×800 and phone
  390×844; empty 9×9 and 19×19, a capture, a preview stone) against committed baselines, and a
  scripted two-colour game on desktop (clicks) and phone (taps + Confirm move) covering turns,
  captures both ways, a refused move, undo, two passes and playing on. The page is lila's built
  bundle and CSS (`lib.theme.all`, `site`, `playground`, fonts from `public/hashed`) served by
  `page.route`, so no lila server; any other request fails the test. They run in the `ui` CI job
  after the build (plus a type-check), and via `dev/ligo test pages` (native mode; docker mode skips
  them). Demo checklist: docs/demos/phase-2.md.
- Worked: checked the tests catch a real change. The capture baseline with its white stone painted
  out fails with 1,487 differing pixels; the real page passes 3 runs in a row.
- Didn't: the first tolerance (0.2% of the page) let that painted-out stone through (it's ~0.15% of
  a 1280×800 page), so it is a pixel count now (100). The first page skipped lila's `site` CSS and
  came out white with serif text. The phone game failed once: goban ignores a confirm within 50 ms
  of the tap, so the test presses Confirm again until the move lands (a retry on a condition, not a
  sleep).
- Unverified: the baselines were recorded with the cloud's Chromium 141 while CI installs
  Playwright 1.63's Chromium 153; goban's coordinates use Verdana/Arial, which falls back to
  Liberation Sans on both. If CI's pictures differ, its report is uploaded as an artifact.
- Decision: one baseline set with no platform in the file name (logs/decisions.md).

### 2026-09-28 · 2.3 review · Reviewer findings fixed
- No blocking findings; the reviewer agreed with keeping goban's second-tap behaviour. Fixed: the
  ctrl tests couldn't fail if desktops were wrongly asked to confirm (the ui test stub makes
  `isTouchDevice()` always true); the choice is now a pure `resolveConfirm(pref, touch)` tested in
  all six cases. `BoardConfig.confirm`'s comment no longer promises double taps; the help text says
  click or tap; PLAN's 2.3 row notes the change; merged main (unit 3.1 landed).
- Left, disclosed: no Scala tests for the pref module (it has none; adding munit is a build.sbt
  change); `confirmMoves` can't be set through the single-pref API and now shows in
  `/api/account/preferences`; "Confirm moves" sits next to chess's "Move confirmation" until Phase 3
  removes the chess settings.

### 2026-09-28 · 2.3 · Touch-confirm setting ("Confirm moves")
- Done: `Pref.confirmMoves` in lila's pref module (never / on touch screens / always, default on
  touch screens; BSON default so old documents read fine), a "Confirm moves" setting on the
  preferences page next to "Confirm resignation", passed to `/playground`, whose page resolves
  "on touch screens" with lila's `isTouchDevice()` and shows a "Confirm move" button while a preview
  waits. No libs/board change: `confirm`, `pending()` and `confirm()` came with 2.1.
- Didn't work as planned: the plan said a second tap on the preview plays it. In goban a second tap
  on the preview takes it back (its `same_stone_clicked`), a tap elsewhere moves it, and goban
  ignores double taps on touch screens (only a mouse double click plays). Kept goban's behaviour,
  with a browser test pinning it and the README saying phones need the page's button.
- Also: ui's test setup attached its `matchMedia` stub to `window` (lib/device calls
  `window.matchMedia`, which jsdom lacks).
- Verified: lila compiles, scalafmt clean, `dev/ligo test ui` 252/252 (4 new), board browser tests
  18/18, lint and format clean; a scratch Chromium check of the compiled page with each setting on
  desktop and an iPhone 13 layout (17 checks). The builder agent reported lila compiling when it
  didn't (`esmInitObj` with an Int needs `Json.obj`): re-run a helper's gates yourself.
- Lesson: goban drops a confirm within 50 ms of the tap (its "bad click" guard) without a word;
  a script that confirms at once fails now and then, a person never.

### 2026-09-28 · 2.2 review · Reviewer findings fixed
- Reviewer (Chromium probes on the compiled bundle): 3 blocking, 4 should-fix. Fixed: a stylelint
  error from a late edit; COPYING.md now notes the new ui package (a package.json with workspace
  dependencies only still counts as a manifest change for the meta check); the komi box kept
  showing typed text after a ruleset or handicap change reset the komi (snabbdom `attrs.value`,
  now `props`); a blank komi meant 0 and komi had no R-KOMI-4 bounds (now ignored, with min/max);
  1-stone handicap (R-HCP-2) added; a failed load of goban's chunk now says so.
- Nits taken: labels tied to their controls (`for`/`id`), the game in play shown under the turn,
  the turn shown after two passes, moves passed in are copied. Left: `handicapStones`' type still
  admits 13 (it throws, and the page never asks).
- 3 more controller tests (`dev/ligo test ui` 248/248); the scratch Chromium check now also checks
  the komi box and the game summary (17 checks, desktop and phone).
- Lesson: bind an input's shown value with snabbdom `props`, not `attrs`; `attrs.value` is only
  the default, which the browser stops showing once the user has typed.

### 2026-09-28 · 2.2 · Playground page (`/playground`)
- Done: a `/playground` route (`controllers.Playground`, `views.playground`) and a `ui/playground`
  snabbdom page: play both colours on 9×9, 13×13 or 19×19; ruleset, handicap and komi for the next
  game; pass, undo, new game, prisoner counts, "both passed" notice. Undo and new game remount the
  board with the shorter move list, so nothing reaches into goban. goban loads lazily with
  `import()`: lila's esbuild splits it into its own chunk (page bundle 8.4 KB).
- `handicapStones` and `standardKomi` (R-HCP-4, R-KOMI) moved from libs/board's test helpers into
  `src/rules.mjs` with types and 2 more tests, so the page and the tests share one table.
- Worked: 8 vitest tests of the page's controller; `dev/ligo test ui` 245/245, `test board`
  219/219; lila compiles with no warnings; lint and format clean.
- Didn't: the full site can't start in cloud sessions (no Docker daemon for Mongo and Redis), so no
  walkthrough on the real page. Instead a scratch Playwright script served lila's compiled bundle
  and CSS and played the page at 1280×800 and on an iPhone 13 layout: capture, undo, two passes,
  19×19 with 4 stones, 13×13 handicap off, no errors, no network. It caught a bug: on phones the
  board shrank to the loading text's width (`margin: auto` on a flex item); fixed with `width: 100%`.
- Decisions (Claude's, under the owner's delegation; logs/decisions.md): 13×13 even games only; plain
  English text (unit 0.7's precedent); no menu link yet; the tables' move above.
- Lesson: a flex item with `margin: 0 auto` shrinks to its content; a box that something measures
  (goban's board) needs an explicit width.

### 2026-09-28 · 2.1 review · Reviewer findings fixed
- Reviewer (adversarial, Chromium probes): 2 blocking, 6 should-fix. Fixed: `dev/ligo deps` still
  installed libs/board on its own (no lockfile there since ADR 0017: it failed, so cloud sessions
  redid deps every start); after `pass()` the board still took clicks and reported a second move
  for the other colour; `play` of a move goban can't place left the turn wrong; `set` during a
  preview froze it; `pass` with a preview did nothing; the browser tests didn't fail on console
  errors; the handicap test checked three rows only; stale `--filter` docs.
- 4 new browser tests (17 now), every browser test fails on a page error, and a dev/ check that
  `dev/ligo` never installs libs/board outside lila's workspace. Each fix was checked by undoing it
  and watching a test fail. `dev/ligo test board`: 217/217.
- Nits taken: `onMove` not called after `destroy`, replayed moves validated, `refusalOf` ignores
  inherited ids, NOTICE names goban's second copyright holder. Left: `@playwright/test` stays
  `^1.63.0` (the lockfile pins 1.63.0; a test tool, not shipped).

### 2026-09-28 · 2.1 · goban's board in libs/board (`mountBoard`)
- Did: added npm `goban` 8.3.226 (same release as goban-engine) and wrapped its SVG board as `mountBoard(el, config)` in `libs/board/src/board.ts`: moves reported (`onMove`) and decided by the page (`play`/`cancel`), `movable` one colour/both/none, `confirm` (preview, then `confirm()`), pass, refusals with reasons, `state()`, sized from and following its box, destroy. Split the shared rule settings into `src/rules.mjs` (no goban import; typed by `rules.d.mts`). Moved libs/board into lila's pnpm workspace (ADR 0017): one lockfile, `--filter @ligo/board` installs and scripts, docker ui container mounts `libs/`, `rules` CI job installs from lila, lints, type-checks and runs the board in Chromium. 13 Playwright tests (desktop clicks, phone taps).
- Worked: pnpm accepts a workspace member outside the workspace folder (`../libs/board`). goban's `sendMove` override plus a stand-in socket feeding `game/<id>/move` drives goban's own play code; all 8 deliberate breakages of the adapter fail the tests. Bundle: 404 KB minified, 101 KB gzipped, with goban's engine once.
- Didn't work / dead ends: mounting in the observed element made the board grow without end (goban sets its element's width); it draws in a child now. Reporting the move synchronously from `sendMove` let goban turn stone placement off after the page had played the move back: reported in a microtask. goban's `onError` never hears about suicide (its handler returns early): the adapter wraps `errorHandler`. goban's default theme is Kaya/Slate/Shell, whose board loads `/img/kaya.jpg` from OGS's CDN. `pnpm run` inside libs/board doesn't find the workspace and wrote a stray lockfile and `pnpm-workspace.yaml`. goban draws in a shadow root (`document.querySelector` can't see the svg; Playwright's locators can). Mobile emulation without a viewport meta renders at 980 px.
- Lessons: see the Lessons lines dated 2026-09-28.
- Decisions: libs/board in lila's workspace, `mountBoard` API, plain theme, browser tests in the rules job: ADR 0017 (Claude, under the owner's 2026-09-28 delegation; logs/decisions.md).
- Verified by Claude: `dev/ligo test board` 213/213 (engine, fixtures, browser); lint and typecheck; tooling self-tests; screenshots (desktop 9×9, phone 19×19 preview) in the PR. · Needs owner verification: docker mode (`dev/ligo test board`, `dev/ligo compile ui` with the new `libs/` mount) on Fedora; how a tap feels on a real phone.
- Follow-ups: 2.2 imports `@ligo/board/board` with `import()` in its page bundle; 2.3 feeds the preference into `confirm`; 2.4 needs Chromium for docker mode (Playwright's image) for screenshots; picture themes need a licence check before any ships.

### 2026-09-28 · Phase 2 breakdown · Split board integration into units
- Did: split PLAN §5's Phase 2 row into units 2.1–2.4 (board in `libs/board`, playground page, touch-confirm setting, visual snapshots + demo), each with what it needs; refreshed docs/STATUS.md.
- Worked: the 1.2 memo, ADR 0014 (and its unit 1.8 amendment) and this log's Lessons already answer the build-vs-buy questions, so no new memo is needed for Phase 2.
- Didn't work / dead ends: none. Every Phase 2 unit sits on unit 1.8's `libs/board`, so none can start before PR #17 merges (only 2.3's server-side preference could).
- Lessons: lila's "submit move" preference confirms after the move (a confirm bar), not the tap-to-preview Go players expect; touch-confirm gets its own preference.
- Decisions: the split and the touch-confirm preference, Claude's calls under the owner's 2026-09-28 delegation (logs/decisions.md).
- Verified by Claude: `bash .claude/skills/verify/verify.sh` (see PR). · Needs owner verification: none; skim the four units if you like.
- Follow-ups: 2.1 decides how `libs/board` joins lila's pnpm workspace; goban's image themes need a licence check before any ships.

### 2026-09-27 · 1.2 · Build-vs-buy: client-side rules, SGF and board (OGS goban spike)
- Did: spiked npm `goban`/`goban-engine` 8.3.226 (release commit 6276a50) and goban `main` (e61c56e) in a scratch folder: the engine in Node (ko, suicide, captures, superko settings, SGF in/out), goban's own engine tests, and the SVG board inside a snabbdom view bundled with lila's esbuild, played by Playwright on desktop and phone viewports; measured bundle sizes; looked at the Sabaki fallbacks. Wrote docs/build-vs-buy/client-board-and-rules.md; asked the owner A (npm, pinned) vs B (vendor source).
- Worked: 203/203 of goban's engine tests; ADR 0003's situational superko via per-game config under both rulesets; tap-to-preview + confirm through goban's own `submit_move`; captures and prisoner counts; no page errors on either viewport.
- Didn't work / dead ends: `npx yarn@1 install` and `npm rebuild` fail in goban's repo (npm refuses its `react` override); use the preinstalled `yarn`. The `canvas` native module has no prebuilt binary for Node 24: move it aside, the engine tests pass without it. `square_size: "auto"` rendered a 100 px board. Confirm threw `No last_clock when calling sendMove()` until `sendMove` was overridden. Setting `player_id` in an `update` handler is too late: set it before emitting the server's move event.
- Lessons: see the four 2026-09-27 lines in Lessons. The reviewer caught two memo errors before the PR: "no handicap table" (goban has one, and its Chinese preset switches to free placement) and goscorer's MIT notice missing from the COPYING plan. Grep upstream before any "it has no X" claim.
- Decisions: A vs B asked in the unit thread, pending (logs/decisions.md). ADR follows the answer.
  (Update 2026-09-28: the owner delegated all decisions; Claude chose A, ADR 0014.)
- Verified by Claude: the spike outputs, test run and screenshots quoted in the memo. · Needs owner verification: none technical; the choice itself.
- Follow-ups: 1.6/1.8 fixtures mark cycles longer than 30 moves as server-only (or offer OGS a patch making the limit configurable); the analysis board's SGF import reads `SZ`/`KM` itself; SGF download comes from the server; check the image themes' licences before shipping any; Phase 2 decides where `libs/board` sits in the pnpm workspace and lazy-loads the board.
