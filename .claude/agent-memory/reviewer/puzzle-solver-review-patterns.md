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

Puzzle-set units (8.4, 2026-09-30):
- An independent ~100-line JS life-and-death minimax (own capture code, attacker must capture
  every original defender stone, attacker pass = gives up, repetition = defender) checks all 240
  in < 1 s and agreed with every right/wrong leaf. Its region must include the defender's stone
  points (a captured inner defender stone is re-playable) or it false-flags corners (DCD5g).
  Mutation-test it (swap a right and wrong first move: 238/240 flagged).
- Dedupe under 8 symmetries + colour swap: 1 rotated/colour-swapped pair (rVMPv/MrhV0) the
  generator's exact-position dedupe missed.
- Recount every stat in the log from the JSON (goals, anchors, shapes, bands by rating ranges
  650–950/1050–1350/1450–1750/1850–2150, longest right line, right first moves); regenerate with
  the same seed in the background (~12 min) to prove determinism and the run tally.
- Log claims verified with a *later unit's uncommitted test* (8.5's Chromium replay) aren't
  reproducible from the PR.

**How to apply:** any solver/tree/generator unit (8.3–8.5, later ko model). Probe with
`catalogue.layout/build` + `Solver.valueAfter` in a scratch .ts run by node from tools/puzzles.
See [[design-adr-review-patterns]].
