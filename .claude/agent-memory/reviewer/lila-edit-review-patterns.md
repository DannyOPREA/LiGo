---
name: lila-edit-review-patterns
description: Recurring issues when reviewing edits inside lila/ (Scala/TS) — scalafmt width, duplicated brand constants, markdown CMS path
metadata:
  type: feedback
---

Checks that paid off reviewing lila/ edits (first seen unit 0.7 rebrand, 2026-09-27):
- Edited Scala lines over 110 cols (lila/.scalafmt.conf maxColumn) that scalafmt can break -> CI `lila` job
  fails on scalafmtCheckAll. Run `awk 'length>110'` on touched files; ignore long string literals.
- Constants duplicated across Scala and ui/ TS (e.g. repo URL in LigoBrand.scala and bits.ts) or hard-coded
  defaults (OpenGraph siteName) that bypass the config layer.
- Cms controller has a separate markdown-negotiation path (negotiateCmsOption) that bypasses HTML fallbacks.
- `git diff origin/main...HEAD` can be inflated when origin/main is stale: `git fetch` first, or diff the commit.

Added from unit 2.2 (playground ui page, 2026-09-28):
- snabbdom `attrs: { value }` on an `<input>` only sets the default: once the user has typed, a
  programmatic reset (e.g. komi recomputed on ruleset change) never shows. Needs `props: { value }`.
  Probe in Chromium: type, change the driver, compare `inputValue()` with `getAttribute('value')`.
- `Number(input.value)` turns an empty/invalid number field into 0 silently; check spec bounds (min/max).
- A new `ui/<page>/package.json` (even workspace-only deps) trips meta's COPYING.md-on-manifest
  check: run `dev/ci/meta_checks.py manifests <merge-base> HEAD`.
- Late CSS edits after the "lint clean" claim: re-run stylelint (verify gate), don't trust the log.
- Parallel threads move origin/main: `git merge-tree --write-tree HEAD origin/main` for STATUS/decisions conflicts.

Added from unit 2.3 (Pref.confirmMoves, 2026-09-28):
- Tests asserting `x === isTouchDevice()` are vacuous for one branch: ui/.test/setup.mts's matchMedia
  stub (matches:false) makes isTouchDevice() always true, and it is memoised. Ask for a pure
  resolver `(pref, isTouch) => boolean` tested on all combos.
- New lila pref: check BSON `getD` default, form `optional` + `| pref.x` (mobile/FormCompatLayer posts
  without it), PrefData.apply prefill, JsonView (public API), PrefSingleChange/RequestPref (not
  needed but note), and that modules/pref has NO test dir (Scala side is code-read only).
- README corrected but the source JSDoc (libs/board/src/board.ts BoardConfig) left stale.
- Rules gate in cloud may fail on strategygames resolution (403) — env, not the unit; run
  `dev/ligo test board` separately to cover the board half.
- Review while the author commits: HEAD can move mid-review; re-check `git log` before reporting.

**Why:** these slip past compile and Playwright checks.
**How to apply:** any unit touching lila/ Scala views/controllers.

Added from unit 5.4 part 1 (signup Go rank, 2026-09-30):
- New site.xml keys: key.scala regenerated but `lila/ui/@types/lichess/i18n.d.ts` (checked in, made by
  `ui/.build --i18n`) often left stale; 3.8 regenerated both.
- A side effect chained into the signup future after `userRepo.create` (e.g. setPerf) makes its failure
  kill logSignup + confirmation email for an account that already exists: ask for recover + log.
- `Perf` with `latest = None` counts as "new": UserPerfs writer's notNew drops it, liveDeviation leaves
  deviation unchanged (elapsed 0). `$set` via setPerf writes it; whole-doc writers would not.
- Help text promising a later part's feature ("you can change it until...") ships in part 1.
- verify.sh "lila tests" is sbt 2 testQuick, cache 100% -> Total 0 everywhere: always run testOnly.
