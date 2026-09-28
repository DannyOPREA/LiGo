---
name: goban-engine-wrapper-review-patterns
description: What to check when reviewing libs/board (goban-engine wrapper, client harness, parity tests): probe branches, silent SGF parse failures, RU override, vacuous handicap tests, truncated licence texts
metadata:
  type: feedback
---

Found reviewing unit 1.8 (libs/board over goban-engine 8.3.226, 2026-09-28):

- **Probing leaves branches:** `place()` then `jumpTo(prev)` keeps the probed node as a branch; it
  shows up in `move_tree.toSGF()` and pushes the real move to a later variation. Check any
  tryMove-style helper removes nodes it created.
- **goban's SGF parser never throws:** malformed/truncated SGF logs "Failed to parse SGF" and returns
  a partial game. Wrapper must detect it. goban's RU handler also overrides `rules` (RU[AGA] ->
  "aga") whatever the wrapper passed. AB[aa:bb] compressed lists are not expanded.
- goban already leaves an SGF engine at the end of the main line (phase "finished"); comments
  claiming otherwise are wrong.
- **Vacuous tests:** a handicap test using goban's own table points can't tell whether goban also
  placed its own stones; use off-table points. Known-gap "expected failure" tests should pin the
  failing assertion, not accept any AssertionError.
- **Licence texts:** diff NOTICE copies against upstream (curl raw LICENSE) — 1.8's goscorer MIT
  text was missing its last line.
- dev/ligo docker helpers using the `ui` service need `docker_env` first (USER_ID .env, pnpm store).
- Parity data read from sbt's target/ can be stale when node tests run alone; look for a digest.

**How to apply:** any libs/board, Phase 2 board, or scoring-service review touching goban-engine.
See [[conformance-fixture-review-patterns]], [[review-patterns-general]].
