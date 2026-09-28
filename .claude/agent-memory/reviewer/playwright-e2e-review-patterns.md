---
name: playwright-e2e-review-patterns
description: Checks for Playwright page/screenshot tests in lila/ui (unit 2.4) — output dirs resolve to nearest package.json, CI path-area gaps, browser mismatch
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
- verify.sh adds gates by changed paths; new test commands (e.g. `dev/ligo test pages`) need a gate.
- `test all` gaining a step that `die`s (ui not built) aborts the later lila/ws/rules steps.
- Probe demo-checklist UI claims with a scratchpad Playwright spec (copy page.ts, symlink node_modules).

**Why:** these pass locally and only surface on CI failure or on the wrong PR.
**How to apply:** any unit adding Playwright tests or CI browser steps. See [[ci-review-patterns]].
