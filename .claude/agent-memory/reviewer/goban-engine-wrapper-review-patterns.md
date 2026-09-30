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

Found reviewing unit 2.1 (goban SVG board wrapper `mountBoard`, 2026-09-28):

- **Probe the waiting windows in a real browser** (scratch Playwright script importing
  libs/board/node_modules by absolute path): goban.pass() never calls disableStonePlacement, so a
  click after pass() but before play('pass') reports a second move for the *other* colour.
- goban's socket `move` handler places with suicide allowed and errors swallowed (console.error):
  a wrapper `play()` that changes player_id before dispatch leaves the board stuck on bad input.
- Workspace moves: grep dev/ligo for leftover `cd libs/board && pnpm install --frozen-lockfile`
  (fails with no lockfile once the package joins lila's workspace). The main session may be
  editing the working tree while you review: diff HEAD vs working tree twice.
- Themes (9.3): goban calls getSelectedThemes in its ctor and again on resize redraws, so an
  override must return a field updated by set(); SVGRenderer.setTheme copies getBackgroundCSS keys
  onto the parent and never clears them (check switch-back screenshots). CDN URLs only in woods,
  Granite, Anime and the "anime" shadow. "Unit = last commit" can be false: diff origin/main...HEAD.
  Check lazy-chunk claims via the compiled .js.map `sources`.

**How to apply:** any libs/board, Phase 2 board, or scoring-service review touching goban-engine.
See [[conformance-fixture-review-patterns]], [[review-patterns-general]].

Found reviewing unit 8.5 (goban puzzle mode `mountPuzzle`, 2026-09-30):

- **Deferred actions leak events**: a retry deferred until goban's reply timer fires still lets that
  reply's `puzzle-wrong-answer` reach `onResult` after the page called retry. Probe with a 300 ms
  reply delay and print the event list; tests that only check the final state miss it.
- **"Refused as occupied" claims**: in puzzle mode a click on a stone emits nothing (no error);
  puzzle mode also skips superko. Check refusal docs by probing, not by reading.
- **Plan wording vs API shape**: PLAN/ADR said "`mountBoard` gains a puzzle option"; the unit shipped
  a separate `mountPuzzle` without recording it. Grep PLAN row + ADR Consequences for the named API.
- goban's `destroy()` calls `removeAllListeners()` on itself and the engine, so a reply timer firing
  after destroy is silent (probed, no page errors).
- Touch-confirm UX differs between goban play mode (second tap removes the preview) and LiGo's puzzle
  glue (second tap plays): flag inconsistencies across boards.
