# Frontend log

## Lessons (curated, ≤ 30 lines — read this first)
_none yet_

## Entries (newest first)

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
