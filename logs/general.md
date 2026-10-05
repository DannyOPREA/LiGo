# General log

## Lessons (curated, ≤ 30 lines — read this first)
_none yet_

## Entries (newest first)

### 2026-10-04 · STATUS.md rewritten from what merged
- **Done:** docs/STATUS.md had stopped tracking units after 3.15 and still listed 3.19, 3.20, 4.12, 5.8,
  6.4–6.10, 7.1–7.8, 8.8 and 9.7–9.10 as waiting, in review or parked. It is rewritten from main's merge
  log: every PLAN §5 unit (0.1–9.10) with its PR(s) in the Phase progress table, no current unit, and
  "Waiting on owner" reduced to the checks only Danny's hands can do, the chess-picture deletion first.
  docs/handoff/README.md's "What is unfinished" now says 6.9 merged (#138).
- **Cross-check:** every PLAN §5 unit has at least one merged PR. The one piece of scope not done is
  9.7's removal of the leftover chess board and piece pictures, which waits on Danny's choice.
- **Lessons:** STATUS.md drifts when many threads merge in parallel and only the coordinator's memory
  is kept current; a unit's /ship should update its own STATUS.md line.
### 2026-10-04 · 9.9 part one · The handoff package (docs/handoff/)
- Did: wrote `docs/handoff/` as ADR 0026 §7 lists it: `README.md` (what LiGo is, reuses, built and
  hasn't finished, one page), `run-it.md` (fresh clone to a running site in docker and native modes,
  the KataGo network), `lessons.md` (every log's Lessons section, shortened and grouped by area),
  `for-ogs.md` (PLAN §8's portable parts with their licences from COPYING.md, plus goban quirks
  worth reporting) and `lobby-research.md` (the 6.3 kit; findings come after 6.10's player test).
  Taken over from the Phase 9 thread, which keeps 9.9 part two (the demo-video script) and 9.10.
- Worked: the Lessons sections, COPYING.md and `dev/ligo help` held everything; no code was read.
- Didn't work / dead ends: nothing.
- Lessons: none new.
- Decisions: one row in logs/decisions.md (link to the kit rather than copy it; goban issues listed,
  never filed).
- Verified by Claude: every path and command named in the pages exists (`dev/ligo help`, file
  listing); verify.sh. Needs owner verification: read README.md and run-it.md once; on a fresh
  clone, run-it.md's docker steps.
- Follow-ups: part two adds the demo-video script; lobby-research.md gains the findings after the
  player test; the "unfinished" list in README.md goes stale as units merge (9.10 refreshes it).

