---
name: puzzle-server-review-patterns
description: Reviewing lila/modules/puzzle on Go puzzles (unit 8.6) - path-build id collisions on real rating clusters, PR mergeability/CI-not-run, reactivemongo leniency, offline Scala probes
metadata:
  type: feedback
---

Checks that paid off reviewing unit 8.6 (PR #89, 2026-10-03):

- **Port builders to JS and run them on the real data**, not the synthetic test spread. The
  generator caps ratings: 52/240 puzzles sit at exactly 2150, so bands share a start rating and
  `PuzzlePathBuilder` path `_id`s (`angle|tier|min-max|gen|index`, index always 0) collide once
  ~3 bands start at 2150 (a second batch of the same shape does it) -> insert.many fails, old
  generation never deleted, isStale says fresh. Tests used evenly spread ratings and missed it.
- **Check the PR is mergeable and CI actually ran on the head SHA**: `gh api
  repos/DannyOPREA/LiGo/pulls/N --jq .mergeable_state` ("dirty" = conflict, no workflow runs) and
  `actions/runs?branch=...`. In the cloud lila can't compile (strategygames unreachable from
  `core`), so CI is the only compile; a log saying "Verified: CI" with no run is a false claim.
- reactivemongo 1.1 default numeric readers are lenient (`BSONDoubleHandler.readTry` calls
  `toDouble`; javap the jar in coursier cache), so int-vs-double fears are usually moot.
- Offline Scala 3 probe works: scala3-compiler 3.9.0 + munit 1.3.6 + reactivemongo jars from
  ~/.cache/coursier, `java -cp ... dotty.tools.dotc.Main -usejavacp -classpath LIBS`. Used it to
  confirm `assertEquals(Some(x), opt)` compiles in Scala 3.
- Simulate mongosh scripts in Node with a stub `db` and `Double` (dev/ligo `puzzles_script`).
- Grep removed symbols across app/ and modules/ AND hard-coded URL strings (IrcApi still linked the
  deleted GIF route; robots.txt in StaticContent).

**How to apply:** 8.7/8.8 and any later puzzle-set or path change. See [[puzzle-solver-review-patterns]],
[[module-removal-review-patterns]].
