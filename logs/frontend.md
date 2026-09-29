# Frontend log

## Lessons (curated, ≤ 30 lines — read this first)
_none yet_

## Entries (newest first)

### 2026-09-29 · Phase 9 breakdown · PWA, polish and handoff split into units 9.1–9.10
- Did: split Phase 9 into 10 units (docs/PLAN.md §5, "Phase 9 units"): a design ADR (9.1), sounds
  (9.2), board themes (9.3) and board accessibility (9.4) in `libs/board` and the playground, a
  performance budget check (9.5), then the lila halves: the PWA (9.6), themes, sounds and
  accessibility on lila's pages (9.7), the credits page (9.8), the handoff package (9.9) and the
  demo (9.10).
- Worked: lila already has a manifest (`StaticContent.manifest`), a service worker (web push only),
  sound sets with a preference, site themes and a non-visual mode, so the lila units adapt them; the
  board halves can be built now on the playground page.
- Didn't work / dead ends: none.
- Lessons: lila's manifest still names lichess and lists lichess's store apps, and its service
  worker does push only (no offline page); its non-visual mode (`ui/lib/src/nvui`) is chess-only.
- Decisions: the split itself, Claude's call under the owner's 2026-09-28 delegation
  (logs/decisions.md).
- Verified by Claude: verify.sh. · Needs owner verification: whether the split reads right.
- Follow-ups: 9.1 next, then 9.2 to 9.5.

### 2026-09-29 · unit 7.1 · ADR 0023: analysis board, SGF import and export, correspondence
- Did: ADR 0023 for Phase 7 and a build-vs-buy memo for the server's SGF reader
  (docs/build-vs-buy/server-sgf-reader.md); the `sgf` skill names that reader as its one exception.
- Worked: lila's tree operations (`ui/lib/src/tree` `ops.ts`, `tree.ts`) are game-neutral and
  `path.ts` only needs two-character ids, which an SGF point already is, so the analysis board can
  keep them unchanged.
- Didn't work / dead ends: no maintained JVM SGF reader (strategygames only writes SGF; sgf4j's
  last Maven release is six years old and pulls in log4j). goban-engine's SGF reader, the first
  plan for the browser, was dropped after the reviewer found it hangs on a truncated file, plays
  moves unchecked, turns off-board points into passes and ignores glyphs; `@sabaki/sgf` (ADR 0014's
  fallback) reads and writes lila's tree instead.
- Lessons: goban's `MoveTree.toSGF` writes no root properties; keep one tree (lila's) and use
  goban only for positions. lila hashes the whole PGN text for import dedup, not the moves.
- Decisions: all of ADR 0023, Claude's calls under the owner's 2026-09-28 delegation
  (logs/decisions.md); the removal of forecasts is recorded there.
- Verified by Claude: verify.sh; a reviewer agent pass (3 blocking, 7 should-fix findings, all
  addressed in the ADR). · Needs owner verification: whether dropping forecasts and keeping the
  opt-in email are the right calls.
- Follow-ups: 7.2 and 7.3 next.

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
