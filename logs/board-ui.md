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
- goban's default theme (no `getSelectedThemes` callback) is Kaya/Slate/Shell and loads a board picture from OGS's CDN: LiGo overrides `getSelectedThemes` with the plain theme (2026-09-28, 2.1).
- libs/board is in lila's pnpm workspace: run its scripts from `lila/` with `--filter @ligo/board`; `pnpm run` inside libs/board starts a lockfile of its own (2026-09-28, 2.1).
- Don't list lila's lint tools again in libs/board: its oxlint resolved without lila's optional `oxlint-tsgolint` peer, a second lockfile entry that a full install never unpacks, so `pnpm licenses` read its licence as Unknown. The board uses lila's own oxfmt/oxlint; install with `--filter @ligo/board --filter lila` (2026-09-28, 2.1).
- goban's `pass()` leaves stone placement on, and its `updateTitleAndStonePlacement` turns it off whenever a preview is shown: an adapter must keep "a move is waiting" state of its own (2026-09-28, 2.1 review).
- A board box that goban measures needs an explicit width: `margin: 0 auto` on a flex item shrinks it to its content (the loading text), and goban then draws a tiny board (2026-09-28, 2.2).
- snabbdom: bind an input's shown value with `props: { value }`, not `attrs`; `attrs.value` is only the default and stops showing once the user has typed (2026-09-28, 2.2 review).
- goban's confirm mode: a second tap on the preview removes it, and double taps on touch screens are ignored; phones need a confirm button calling `board.confirm()` (2026-09-28, 2.3).

## Entries (newest first)

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
