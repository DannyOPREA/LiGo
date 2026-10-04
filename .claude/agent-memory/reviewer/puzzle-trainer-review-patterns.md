---
name: puzzle-trainer-review-patterns
description: Reviewing ui/puzzle on libs/board's mountPuzzle (unit 8.7) - CI area gaps for tests reading tools/puzzles/data, vacuous "not X" stone assertions, scratch Playwright probes, CI job steps as the Scala compile proof
metadata:
  type: feedback
---

Checks that paid off reviewing unit 8.7 (PR #95, 2026-10-04):

- **Tests that read another area's files need that area in dev/ci/changed.sh.** ui/puzzle's unit
  test and e2e read `tools/puzzles/data/generated-*.json` (by puzzle id), but the `ui` area regex
  didn't list `tools/puzzles/data/`, so a data-only PR skips the ui job and main goes red after
  merge. Simulate: `echo <path> | grep -qE '<area regex>'`.
- **"stone is not X" after a click is vacuous when White is to move**: the solution's last position
  had White to move, so a click would place `O` and still pass. Probe by adding a style tag that
  undoes the guard (`pointer-events:auto`) and see whether the assertion would fail.
- Scratch Playwright probe importing the repo's e2e helpers: scratch dir needs
  `package.json {"type":"module"}`, a `.mts` config, a `node_modules` symlink to lila/node_modules,
  and `.ts` extensions on absolute imports. Run from lila/ with `-c <scratch config>`.
- When lila can't compile in the cloud, `gh api repos/DannyOPREA/LiGo/actions/runs/<id>/jobs`
  lists each step's conclusion: "Check formatting, compile and test: success" on the head SHA is
  the compile proof. Restored upstream controller code: diff against the pre-placeholder commit
  (`git show <3.16>~1:path`) and only check symbols that changed since.
- Lockfile hand edits: `pnpm install --frozen-lockfile --offline` printing "Lockfile is up to date"
  is the validity check.

**How to apply:** 8.8 and any page whose tests use committed data or a stand-in server.
Related: [[puzzle-server-review-patterns]], [[round-ui-review-patterns]], [[ci-review-patterns]].
