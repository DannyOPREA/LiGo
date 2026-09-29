---
name: build-vs-buy-memo-review-patterns
description: What to check when reviewing a LiGo build-vs-buy memo (docs/build-vs-buy/): licences, full §3.1 row scope, spike cross-checks, unlisted parameters, PLAN §10 deferred items
metadata:
  type: feedback
---

Checks that found real problems in the unit 1.1 memo (server-side Go rules, 2026-09-27):

- **"No licence in metadata" is often false.** A POM with no `<licenses>` element can still carry a
  GPL header comment (joansala samurai/aalina POMs: GPL-3.0-or-later). Read the whole POM in
  `/root/.cache/coursier/v1/...`, not just the `<licenses>` tag.
  **Why:** the build-vs-buy skill requires licences "stated exactly"; PLAN §2.2 rejects "unclear".
- **Check the memo covers the whole §3.1 row.** The server-rules row includes the byo-yomi clock;
  the memo punted it although strategygames ships `ByoyomiClock` in the same artifact, and no
  Phase 1 unit picked it up.
- **Cross-check memo facts against the spike's own output** (komi in the FEN string contradicted
  "7.5 per board size"; 9×9 is 5.5) and against `git log`/`git show` of the upstream (the "C++/JNI
  engine" was really a Java `com.joansala:go-engine`).
- **Evidence files vs claims:** compare file mtimes (cp.txt, run.log, build.sbt) to see which
  claims (before/after exclusions) actually have a saved artifact.
- **Cloud consequence of a new Maven repo:** `~/.sbt/repositories` (dev/cloud-setup.sh, ADR 0008)
  overrides build resolvers, so a new resolver also needs cloud-setup + CI changes; memos tend to
  omit this.
- Local `main` ref can be stale; diff against `origin/main` after `git fetch` (see
  [[guard-hook-review-patterns]]).

Unit 1.3 (scoring memo, 2026-09-27) found more of the same kind:
- **Check how the upstream fixture was generated** (goban `scripts/fetch_game_for_autoscore_testing.ts`):
  correct answers seeded from the same stored maps make "N/N on stored data" circular, and the
  fixture's query settings (rules "chinese") may differ from the spike's (japanese) -> not like-for-like.
- **Timestamp overlap**: `stat` run files + klogs names to spot concurrent runs (inflated timings)
  and claims with no saved artifact (a "28/31 earlier run").
- **Deferred items from the previous memo** (1.1 handed strategygames' area scoring to 1.3) must
  appear as candidates.
- Check the runtime version claimed (`which -a node`; spike ran on 24 while memo said 22).

**How to apply:** for every future memo (1.2 goban, 1.3 scoring, 1.4 batch) run these checks.

Added after the unit 1.4 ratings memo review (2026-09-27):
- **"Matches X exactly" claims hide unlisted parameters.** The spike matched OGS per game, but the
  parameter table skipped lila's default volatility (0.09 vs 0.06), volatility cap (0.1 vs 0.15),
  start deviation, `maxRatingDelta`, `RatingRegulator` (bot halving). Read every constant in
  lila/modules/rating/src/main/Glicko.scala, Perf.scala, RatingRegulator.scala and PerfsUpdater.
- **"Just a lila constant" may live in the dependency.** `provisionalDeviation = 110` is a top-level
  val in scalachess `glicko/model.scala`, not lila; changing it is a wrapper or fork, not a constant.
- **Check PLAN §10 "Decisions deferred"**: a memo can silently settle a deferred item (goratings'
  9×9 stone value = 6 ranks vs PLAN §10 "9×9 stone value → Phase 5").
- Sparse clones (ps-lila had only rating + round) limit what "X does no Y" claims can rest on.

Added after the unit 8.1 tsumego-content memo review (2026-09-29):
- **A content memo that picks "we build a generator" needs its own code survey.** 8.1 chose rung-6
  custom (generator + exhaustive solver + KataGo check) with no search for existing solvers/frames;
  KaTrain's MIT `katrain/core/tsumego_frame.py` (port of lizgoban) was one GitHub fetch away.
- **Own-output licence choices hide in passing.** ADR 0024 made puzzle files CC0 although ADR 0007
  (owner-decided) says everything in `tools/` is MIT; not flagged as an exception, not in decisions.md.
- **Check PLAN §3.1 row and §10 deferred row** get updated when an ADR deviates from the planned
  "Chosen/Fallback" (8.1's generator is not "positions from game records").
