# Rules engine log

## Lessons (curated, ≤ 30 lines — read this first)
- PlayStrategy's strategygames Go package is pure Scala since Aug 2026 (MIT). It has area scoring, situational superko, handicap placements and dead-stone agreement (2026-09-25, planning research).
- PlayStrategy's Go bug history gives us test cases: early game end on repetition, infinite games by a losing player, dead-stone countdown/expiry, one-click group selection (2026-09-25, planning research).
- strategygames is one artifact for all its games, published only to PlayStrategy's GitHub-hosted Maven repo (raw.githubusercontent.com/Mind-Sports-Games/lila-maven). Its Go package and `ByoyomiClock` load no other game's classes; exclude `fairystockfish`, `com.joansala.aalina`, `com.joansala` to drop the native and unused-game jars (Fairy-Stockfish GPL-3.0; aalina/samurai GPL-3.0-or-later per their POM headers, no `<licenses>` element: read the whole POM) (2026-09-27, 1.1).
- strategygames Go: two passes open its own dead-stone selection phase, not game end; komi defaults to 5.5 on 9×9 and 7.5 on 13×13/19×19 (overridable per game); no Japanese/Chinese ruleset notion (2026-09-27, 1.1).
- OGS goban (Apache-2.0) ships an engine-only package, `goban-engine`, with JP/CN/AGA/etc. rules, SGF and time systems (2026-09-25, planning research).

## Entries (newest first)

### 2026-09-27 · 1.1 · Build-vs-buy: server-side Go rules (strategygames spike)
- Did: broke Phase 1 into units 1.1–1.9 (PLAN §5). Spiked strategygames `10.2.1-s3-ps14` (commit 7344183) in a throwaway sbt 2.0.9 / Scala 3.8.4 project with lila's scalalib and scalachess versions; ran its own Go tests; exercised its `ByoyomiClock`; wrote docs/build-vs-buy/server-go-rules.md; asked the owner A (dependency, exclusions) vs B (vendor Go package).
- Worked: resolution from PlayStrategy's repo; Scala 3.7.4-built artifact consumed from 3.8.4; a 9×9 ko retake refused; `-verbose:class` showed only `strategygames`, `.go`, `.go.format`, `.go.variant` classes loaded; exclusions leave only strategygames, joda-time and scala-parser-combinators beyond scalachess's jars; 413/413 of its Go tests pass on its own build.
- Didn't work / dead ends: `sbt "show x" run` fails in sbt 2 (can't mix input tasks); `-Dsbt.override.build.repos=false` ignored because a running sbt server kept its JVM options; `git ls-tree --long` on a blobless clone fetches every blob (killed).
- Lessons: see the two 2026-09-27 lines in Lessons (and one sbt lesson in tooling.md). The reviewer caught three memo errors before the PR: aalina/samurai called "no licence" (their POM headers say GPL-3.0-or-later), 9×9 komi (5.5, visible in the spike's own output), and the byo-yomi half of the §3.1 row left out. Cross-check memo facts against the spike's output and cover the whole §3.1 row.
- Decisions: A vs B asked in the unit thread, pending (logs/decisions.md). ADR follows the answer.
- Verified by Claude: the spike output and test run quoted in the memo. · Needs owner verification: none technical; the choice itself.
- Follow-ups: the adapter unit (1.7) maps lila's scoring phase onto strategygames' dead-stone phase and sets komi/ruleset; record the jar's SHA-256 in docs/UPSTREAM.md if A is chosen. Add Go-side byo-yomi clock tests (its clock tests live in its shogi package). Its tests were not run against Scala 3.8.4 (only its own 3.7.4 build); 1.7 runs them through our adapter.
