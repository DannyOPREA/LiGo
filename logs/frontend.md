# Frontend log

## Lessons (curated, ≤ 30 lines — read this first)
_none yet_

## Entries (newest first)

### 2026-09-29 · Phase 7 breakdown · Correspondence, SGF and analysis split into units 7.1–7.8
- Did: split Phase 7 into 8 units (docs/PLAN.md §5, "Phase 7 units"): a design ADR (7.1), the
  analysis tree over goban-engine in `libs/board` (7.2), the server's SGF reader in `libs/go-rules`
  (7.3), then the lila halves: the analysis board page (7.4), SGF import and game analysis (7.5),
  correspondence on the server (7.6) and in the UI (7.7), and the demo (7.8).
- Worked: lila already has the analysis board and move tree, `/paste` import, the days-per-move
  clock, `CorresAlarm`, `notify` and `push` (all kept by ADR 0018), so the lila units adapt them;
  the SGF halves live in the two rules libraries, which nothing else is changing, so they can be
  built before the fork.
- Didn't work / dead ends: none.
- Lessons: lila's analysis page (`controllers.UserAnalysis`, `ui/analyse`) also hosts forecasts
  (correspondence conditional moves, stored as UCI lines), so whether forecasts survive is a
  correspondence question for 7.1, not an analysis-board detail.
- Decisions: the split itself, Claude's call under the owner's 2026-09-28 delegation
  (logs/decisions.md).
- Verified by Claude: verify.sh. · Needs owner verification: whether the split reads right.
- Follow-ups: 7.1 next, then 7.2 and 7.3.
