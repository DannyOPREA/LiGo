---
name: puzzle-solver-review-patterns
description: What found real bugs reviewing tools/puzzles (unit 8.3 tsumego solver, tree builder, KaTrain frame port, KataGo second opinion)
metadata:
  type: feedback
---

Checks that found real problems in unit 8.3 (tools/puzzles, 2026-09-29):

- **Trace "two moves in a row" tests move by move.** tree.ts `settled()` did move(r), forcePass(),
  then `valueAfter(null)`, which made the *opponent* pass, not move again: the test collapsed to
  "the move wins", so every kill puzzle and most live ones ended after one move (0/60 puzzles
  deeper than 1). Measure tree depths of a real `generate` run with a stand-in KataGo; a histogram
  catches it in a minute.
- **Duplicate catalogue shapes**: 'bent four' ['...','-.'] was the same T as 'pyramid four'; compare
  `layout(...).eye` of every shape pair (provenance names are outward facing).
- **Frame port**: strip KaTrain's two import lines (`sed '/^from /d'`) and rerun the fixture boards
  through the Python; overlay blacks/whites on the board to compare.
- Ownership sign relies on analysis_example.cfg `reportAnalysisWinratesAs = BLACK`; no
  overrideSettings pin, KATAGO_CONFIG env can swap the config.
- Log/decisions lines claimed in an ADR amendment ("(logs/decisions.md)") often aren't written yet.

**How to apply:** any solver/tree/generator unit (8.3–8.5, later ko model). Probe with
`catalogue.layout/build` + `Solver.valueAfter` in a scratch .ts run by node from tools/puzzles.
See [[design-adr-review-patterns]].
