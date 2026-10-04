---
name: analysis-board-review-patterns
description: Reviewing ui/analyse on libs/board (unit 7.4) — COPYING.md meta check on workspace links, stale SGF box state, remount focus loss, doubled SgfError prefixes, scratch ctrl probe loader
metadata:
  type: feedback
---

Found reviewing unit 7.4 (Go `/analysis`, 2026-10-03):
- **Run `python3 dev/ci/meta_checks.py manifests origin/main HEAD` on every unit touching a
  package.json/lockfile.** A `workspace:*` link alone still trips the required `meta` check unless
  COPYING.md changes (precedent: 2.2 and 3.18 added a "no third-party code" row).
- Page state that "freezes while the player edits" (sgfInput, sgfError) never resets when the tree
  changes from the board: probe edit box -> play a move -> Load.
- `errorText` prefixing "Move N:" onto SgfError messages that already start "move N:"; the e2e regex
  `/^Move 2: /` hid the doubling. Print real messages in a probe.
- Remount-per-position boards (round, analyse) drop keyboard focus and the live region after every
  move; mountBoard has `play(move)` to answer onMove without a remount (ADR 0026 §4).
- Scratch ctrl probe for a ui package without `exports`: chain an extra `--loader` mapping `@/` to
  the package's src (ui/.test/resolve.mts maps `@/` to `<pkg>/...`, which self-reference can't
  resolve). Never drop probe files into the repo's tests dir, even briefly.
- Leftover readers of removed bundles: grep Scala for `Esm("<bundle>")` and module modes (ReplayUi
  still loads `analyse.nvui` and `analyse.user` with mode "replay").
- The main session may edit the worktree mid-review (scalafmt on AnalyseUi): `git status` again
  before quoting line content.

**Why:** the unit's own 237 unit + 13 page tests all passed with these present.
**How to apply:** 7.5 (game analysis), 8.7 (puzzle page), 9.7, any lila page on libs/board.
Related: [[round-ui-review-patterns]], [[board-a11y-review-patterns]], [[sgf-tree-review-patterns]].
