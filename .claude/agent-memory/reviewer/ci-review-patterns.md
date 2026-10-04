---
name: ci-review-patterns
description: Weak spots found reviewing LiGo's GitHub Actions + dev/ci checks (changed.sh areas, meta_checks.py log/licence checks)
metadata:
  type: project
---

Seen reviewing unit 0.6 CI (2026-09-27):
- `git diff --name-only` without `--no-renames` hides the old path of a move → area builds skipped.
  Probe: throwaway repo, `git mv lila-ws/x docs/x`, run dev/ci/changed.sh.
- Area detection written as "paths that need a build" silently skips new dirs (libs/, services/).
- Log check counting any logs/*.md is satisfied by logs/decisions.md alone.
- `pnpm licenses list --prod` misses lila's bundled browser libs (snabbdom, chessground are root devDeps).
- The licence allowlist in meta_checks.py is licensing policy (§7) and can drift from COPYING.md.
- Implementers record "owner chose X" in decisions.md/docs without a visible owner answer: ask for the source.
- Importing dev/ci/*.py from a review probe leaves __pycache__ (not gitignored). Use `python3 -B`.

- Source-code guards (unit 3.17 part 3 chess guard, 2026-10-04): regexes anchored on `import` miss
  lila's inline fully-qualified uses (`chess.variant.Standard`, `chess.format.Fen.Full`), `export chess.format.Uci`
  and `import chess.{ …, variant }` (24 files missed). Probe: git grep the unanchored pattern minus the baseline.
  Also: a failing step in the required `lila-paths` job skips lila/lila-ws builds (lost signal).
  The `python3 -B` rule above applies, and I broke it again; remove dev/ci/__pycache__ afterwards.

**Why:** the implementer's run.sh tests passed while all of these slipped through.
**How to apply:** on any CI/workflow diff, run the rename probe, the decisions.md-only log probe and a
licence scan with and without `--prod` on the real lila tree. Related: [[dev-script-review-patterns]].
