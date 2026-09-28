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
