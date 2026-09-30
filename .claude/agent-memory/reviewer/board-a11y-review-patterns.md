---
name: board-a11y-review-patterns
description: Patterns from reviewing keyboard/screen-reader work on libs/board (unit 9.4): key repeat, vacuous focus tests, lila mousetrap clash, axe exemptions
metadata:
  type: feedback
---

Checks that found real issues in unit 9.4 (2026-09-30):
- **Key repeat**: a keydown handler that plays/confirms/passes must ignore `e.repeat`. Playwright `keyboard.down` twice sends repeat=true; holding Enter defeated Confirm moves, holding P passed twice.
- **Mouse click on goban's board does not focus it** (goban swallows pointer events in its shadow root), so any test "a click focuses the board without showing the cursor" is vacuous: check `document.activeElement` first.
- **lila's mousetrap** (`ui/site/src/mousetrap.ts`) fires document-level hotkeys (arrows, home/end, f, z...) unless the target is an input or has `trap-bypass`; a focusable board that only preventDefaults will double-fire on round/analyse/puzzle pages.
- **axe exemptions by regex on `n.html`**: `\bbutton\b` also matches `button-red`, `x-button`; on the playground every button is `.button`, so "only lila's buttons" = all buttons. Suggest filtering on `n.any[0].data` fg/bg colours instead.
- A "Ctrl+Arrow is ignored" test that only asserts no onMove event is vacuous for arrows; assert the live-region text/cursor too.
- Live-region re-announce tricks (alternating NBSP) are invisible to tests that `.trim()`; ask for a repeated-text assertion.
- Probing: a scratch .mjs that imports `/home/user/LiGo/libs/board/node_modules/@playwright/test/index.mjs` and esbuild-bundles `libs/board/test/browser/harness.ts` runs real browser probes without touching the repo.
- Lockfile hand-edits: `pnpm install --lockfile-only --fix-lockfile` online in a scratch copy (git archive of package.jsons + pnpm-workspace.yaml + patch files) reproduces pnpm's own entries; compare only the touched packages (other drift is pre-existing).

**Why:** these were missed by the unit's own tests though all 33+3 passed.
**How to apply:** any unit adding key handling or axe checks in libs/board or lila pages (3.18, 7.4, 8.7, 9.7). Related: [[playwright-e2e-review-patterns]], [[goban-engine-wrapper-review-patterns]].
