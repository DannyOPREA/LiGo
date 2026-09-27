# Rules engine log

## Lessons (curated, ≤ 30 lines — read this first)
- PlayStrategy's strategygames Go package is pure Scala since Aug 2026 (MIT). It has area scoring, situational superko, handicap placements and dead-stone agreement (2026-09-25, planning research).
- PlayStrategy's Go bug history gives us test cases: early game end on repetition, infinite games by a losing player, dead-stone countdown/expiry, one-click group selection (2026-09-25, planning research).
- strategygames is one artifact for all its games, published only to PlayStrategy's GitHub-hosted Maven repo (raw.githubusercontent.com/Mind-Sports-Games/lila-maven). Its Go package and `ByoyomiClock` load no other game's classes; exclude `fairystockfish`, `com.joansala.aalina`, `com.joansala` to drop the native and unused-game jars (Fairy-Stockfish GPL-3.0; aalina/samurai GPL-3.0-or-later per their POM headers, no `<licenses>` element: read the whole POM) (2026-09-27, 1.1).
- strategygames Go: two passes open its own dead-stone selection phase, not game end; komi defaults to 5.5 on 9×9 and 7.5 on 13×13/19×19 (overridable per game); no Japanese/Chinese ruleset notion (2026-09-27, 1.1).
- Superko history differs by engine: strategygames skips situations after passes, goban skips the start position and looks back only 30 moves; strategygames counts passes across a resume (4th pass settles with no dead stones). The spec (docs/rules) is the truth; adapters bridge (2026-09-27, 1.5).
- OGS goban (Apache-2.0) ships an engine-only package, `goban-engine`, with JP/CN/AGA/etc. rules, SGF and time systems (2026-09-25, planning research).

## Entries (newest first)

### 2026-09-27 · 1.5 · Rules spec drafted for owner approval
- Did: go-rules-expert wrote docs/rules/spec.md (rule IDs for moves, situational superko and its history, handicap tables, komi, end of play, scoring phase, Japanese/Chinese scoring, results; an engine-mapping table; a fixture checklist; intentional departures from J1989/C2017; 11 open points) and a README index. Engine facts checked in strategygames 7344183, goban-engine 8.3.226 (npm source map), KataGo v1.18.1 boardhistory.cpp and goscorer 0ac5f59; goban-engine run for handicap tables, compensation and two superko probes. The reviewer re-ran the tables and the probes before the draft went into the repo.
- Worked: both engines place 2–9 handicap stones on identical points on 9×9 and 19×19 (checked mechanically, GTP and SGF). goban's own "superko" test position (plus White C19) gives two ready-made fixtures that separate the engines.
- Didn't work / dead ends: J1989/C2017 texts unreachable (proxy 403 outside GitHub/npm/Maven), so article numbers are marked "from memory". Direct docs/rules writes stalled on owner prompts while he was away; drafts moved to the scratchpad and were applied in one write per file.
- Lessons: engines disagree on the superko history: strategygames records no situation after a pass (goban and KataGo do); goban never checks the starting position and looks back only 30 moves. strategygames keeps counting passes across a resume and settles with no dead stones on the 4th pass; its 1-stone handicap places a stone. goban's Chinese preset uses free placement, and its Chinese compensation depends on the `handicap` field (memo 1.2's `handicap: 0` recipe loses it). Replay every move sequence a spec cites; test any "bounded by X" claim (the reviewer caught "bounded by clocks", false under byo-yomi/Fischer/correspondence).
- Decisions: 11 open points put to the owner as one approval card (spec §12, logs/decisions.md).
- Verified by Claude: goban-engine runs and handicap-table conversions (writer and reviewer); strategygames/KataGo/goscorer facts read from source with file:line. · Needs owner verification: the 11 open points; J1989/C2017 article references.
- Follow-ups: 1.6 builds the pass-node and start-position superko fixtures; 1.7 adds post-pass situations to the server's superko history (if open point 1 = yes), resets the pass count on resume, builds 1-stone games as handicap 0, rejects >9 stones; 1.8 passes handicap N + free_handicap_placement:false + initial_state + explicit komi to goban and marks its 30-move window and start-position gap as known client gaps.

### 2026-09-27 · 1.1 · Owner chose strategygames as a dependency
- Did: recorded the owner's answer (option A) as ADR 0012; marked the memo decided; updated STATUS and decisions.md.
- Worked: the question went out as a decision card with work continuing, and was answered the same afternoon.
- Didn't work / dead ends: none.
- Lessons: none new.
- Decisions: A, dependency with fairystockfish/aalina/joansala excluded (owner) → ADR 0012.
- Verified by Claude: docs-only; /verify and CI on the PR. · Needs owner verification: none.
- Follow-ups: unit 1.7 adds the dependency, the resolver (lila build, dev/cloud-setup.sh, CI), the SHA-256 in docs/UPSTREAM.md and the COPYING.md notice.

### 2026-09-27 · 1.1 · Build-vs-buy: server-side Go rules (strategygames spike)
- Did: broke Phase 1 into units 1.1–1.9 (PLAN §5). Spiked strategygames `10.2.1-s3-ps14` (commit 7344183) in a throwaway sbt 2.0.9 / Scala 3.8.4 project with lila's scalalib and scalachess versions; ran its own Go tests; exercised its `ByoyomiClock`; wrote docs/build-vs-buy/server-go-rules.md; asked the owner A (dependency, exclusions) vs B (vendor Go package).
- Worked: resolution from PlayStrategy's repo; Scala 3.7.4-built artifact consumed from 3.8.4; a 9×9 ko retake refused; `-verbose:class` showed only `strategygames`, `.go`, `.go.format`, `.go.variant` classes loaded; exclusions leave only strategygames, joda-time and scala-parser-combinators beyond scalachess's jars; 413/413 of its Go tests pass on its own build.
- Didn't work / dead ends: `sbt "show x" run` fails in sbt 2 (can't mix input tasks); `-Dsbt.override.build.repos=false` ignored because a running sbt server kept its JVM options; `git ls-tree --long` on a blobless clone fetches every blob (killed).
- Lessons: see the two 2026-09-27 lines in Lessons (and one sbt lesson in tooling.md). The reviewer caught three memo errors before the PR: aalina/samurai called "no licence" (their POM headers say GPL-3.0-or-later), 9×9 komi (5.5, visible in the spike's own output), and the byo-yomi half of the §3.1 row left out. Cross-check memo facts against the spike's output and cover the whole §3.1 row.
- Decisions: A vs B asked in the unit thread, pending (logs/decisions.md). ADR follows the answer.
- Verified by Claude: the spike output and test run quoted in the memo. · Needs owner verification: none technical; the choice itself.
- Follow-ups: the adapter unit (1.7) maps lila's scoring phase onto strategygames' dead-stone phase and sets komi/ruleset; record the jar's SHA-256 in docs/UPSTREAM.md if A is chosen. Add Go-side byo-yomi clock tests (its clock tests live in its shogi package). Its tests were not run against Scala 3.8.4 (only its own 3.7.4 build); 1.7 runs them through our adapter.
