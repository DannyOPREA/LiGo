# General log

## Lessons (curated, ≤ 30 lines — read this first)
_none yet_

## Entries (newest first)
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

