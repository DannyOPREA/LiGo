---
name: rules-spec-review-patterns
description: What to check when reviewing LiGo's Go rules spec (docs/rules/spec.md) or fixture descriptions: replay cited move sequences, pass-count/resume interplay with strategygames, "bounded by clocks" claims
metadata:
  type: feedback
---

Checks that found real problems in the unit 1.5 spec draft (2026-09-27):

- **Replay every move sequence the spec cites** in goban-engine (npm tarball, extract
  `GobanEngine.ts` from `build/goban-engine.js.map` with JSON.parse) instead of trusting "checked".
  The draft's two superko fixtures started from goban's test position but only work once White C19
  is already on the board; taken literally the first Black move is suicide.
- **Resume vs strategygames' pass counter:** strategygames keeps counting passes across a resume
  (3rd pass allowed, 4th auto-settles with no dead stones, `passesSettlingTheGame = 4`). Any
  "resume" rule must say whether the pass count restarts, and the adapter guidance must cope.
- **"The clocks bound it" is false** under byo-yomi, Fischer and correspondence: a pass inside a
  period/increment costs nothing, so resume → pass → pass can loop forever. Ask for a real bound.
- **Handicap-game komi** (0.5 vs 0) and similar table values are rules decisions (PLAN §7): each
  needs its own open point, not just the headline items.
- Mechanical checks worth keeping: rule-ID uniqueness (grep defined IDs, `uniq -c`), references
  resolve, GTP↔SGF via a tiny script against strategygames' FEN tables.
- "Already decided" lists: check the PLAN wording ("Proposed" is not decided).

**How to apply:** on every docs/rules or fixture review; see also [[build-vs-buy-memo-review-patterns]].
