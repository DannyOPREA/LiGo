---
name: playwright-e2e-review-patterns
description: Checks for Playwright tests in lila (units 2.4, 8.8) — output dirs, CI area gaps, browser mismatch, import.meta loads 0 tests, no Origin on page.request, casual by-id puzzles, API rate limits
metadata:
  type: feedback
---

Found reviewing unit 2.4 (playground screenshots + scripted game, 2026-09-28):
- Playwright 1.63 puts default `test-results/` and html `playwright-report/` next to the NEAREST
  package.json of the config dir (lila/ui/<pkg>/), not the config's dir. Artifact upload paths
  pointing at `<pkg>/e2e/...` upload nothing. Check `lib/util.js resolveReporterOutputPath` and
  `common/index.js outputDir`, or set `outputDir`/`outputFolder` explicitly.
- dev/ci/changed.sh areas: tests that guard libs/board rendering but run in the `ui` job are
  skipped on a libs/board-only PR (libs/board is only in `rules`). Check which area triggers a job.
- Baselines recorded with cloud /opt/pw-browsers/chromium (full Chromium, different version) vs CI's
  Playwright-installed headless shell: first CI run is the real check.
  Confirmed real in 9.6 (2026-09-30): the push-notification test passes in full Chromium but fails
  deterministically in headless shell (`showNotification`/`getNotifications` empty). Re-run new
  browser-feature tests with `LIGO_CHROMIUM=/opt/pw-browsers/chromium_headless_shell-*/chrome-linux/headless_shell`
  (Playwright 1.63 picks the shell when headless and no `channel`: coreBundle `getExecutableName`).
- Service-worker units: probe with a scratch node script importing playwright-core by absolute
  .pnpm path; check install-time cache failure is retried (it isn't, until the worker bytes change).
- verify.sh adds gates by changed paths; new test commands (e.g. `dev/ligo test pages`) need a gate.
- `test all` gaining a step that `die`s (ui not built) aborts the later lila/ws/rules steps.
- Probe demo-checklist UI claims with a scratchpad Playwright spec (copy page.ts, symlink node_modules).

Real-stack e2e (lila/tests/e2e-demo, unit 8.8 part two, PR #126, 2026-10-04):
- `import.meta` in a spec under a dir whose nearest package.json lacks `"type": "module"` (lila/
  has none; ui/<pkg>/ do) makes Playwright load NOTHING: "Total: 0 tests", the other demos die too.
  `tsc`/oxlint/format all pass. Always run `pnpm exec playwright test -c <config> --list`.
- `page.request.post` sends no Origin and no X-Requested-With (probe: node http server + Playwright
  request). lila's CSRFRequestHandler rejects a POST with no Origin (403). Needs an `Origin` header
  matching net.domain, or X-Requested-With: XMLHttpRequest, or drive the real form.
- lila's `/training/:id` (and /training/:angle/:id) marks the puzzle casual for a user who never
  played it (PuzzleApi.casual): no rating change. Only puzzles the selector serves are rated.
- /api/puzzle/many costs 1 credit per id against 300/hour/IP (puzzle.fetch.ip): 240 ids per run
  means a CI retry or a 2nd local run in an hour gets 429. /api/puzzle/:id (apiShow) is unlimited.


Unit 7.8 (phase7 demo, 2026-10-04):
- Accounts reused across projects/retries (temp file keyed by port) make persistent lists (bell entries,
  lobby now-playing) carry earlier runs' items: `toContainText` on the whole list is vacuous on the 2nd
  project, and `.filter({hasText: opponent}).first()` picks a stale game. Scope by the game id href.
- lila's crawler regex (modules/web HttpFilter) includes `HeadlessChrome`; `/login` POST is NoCrawlers
  (404), Round.watcher serves the crawler view. Desktop projects with no UA need a real Chrome UA.
- corres clock text is hour-granular ("1 day 23 hours"): "clock didn't move" text compares over seconds
  are vacuous; the `.running` class is the real check.

**Why:** these pass locally and only surface on CI failure or on the wrong PR.
**How to apply:** any unit adding Playwright tests or CI browser steps. See [[ci-review-patterns]].
