# Tsumego log

## Lessons (curated, ≤ 30 lines — read this first)
- Modern tsumego books are copyrighted, and sanderland/tsumego is MIT for its code only. Public-domain classics are OK only as our own transcriptions from original sources, because the UK/EU database right can protect modern datasets (2026-09-25, planning research).

## Entries (newest first)

### 2026-09-29 · Phase 8 breakdown · Tsumego split into units 8.1–8.8
- Did: split Phase 8 into 8 units (docs/PLAN.md §5, "Phase 8 units"): a content memo with a licence
  check (8.1), a design ADR (8.2), the `tools/puzzles` import pipeline (8.3), the first ≥ 200
  puzzles (8.4), puzzle solving in `libs/board` (8.5), then the lila halves: the puzzle module on
  the server (8.6), the trainer page (8.7) and the demo (8.8).
- Worked: lila's `puzzle` module and `ui/puzzle` are kept (ADR 0018), so the lila units adapt them;
  the content, the pipeline and the solving logic live outside lila, so they can be built before
  the fork.
- Didn't work / dead ends: none.
- Lessons: lila's `Puzzle` is one forced line (`fen` + `line` of UCI moves) with the opponent's
  first move played for you; a tsumego has several right answers and refutations, so the stored
  puzzle and the browser's checker both need a tree, not a line.
- Decisions: the split itself, Claude's call under the owner's 2026-09-28 delegation
  (logs/decisions.md).
- Verified by Claude: verify.sh. · Needs owner verification: whether the split reads right.
- Follow-ups: 8.1 next, then 8.2 to 8.5.
