---
name: sbt-build-wiring-review-patterns
description: Weak spots found reviewing lila sbt build wiring (unit 3.10, ProjectRef to libs/go-rules): resolver order, duplicated mounts, verify/CI trigger drift, testQuick
metadata:
  type: project
---

Seen reviewing unit 3.10 (2026-09-30):
- sbt puts user `resolvers` BEFORE Maven Central (combineDefaultResolvers), so adding a third-party
  repo to lila's build settings exposes every lila artifact to it, not just the pinned one.
- A `ProjectRef` build passes on libraryDependencies but not resolvers/excludeDependencies; check
  the dependent's `export Runtime/fullClasspath` and that the smoke test's class names really
  exist in the excluded jars (unzip -l the coursier cache).
- When compose.yml gains a mount, grep dev/ligo for `dc run -v` of the same target (docker_rules_sbt).
- changed.sh trigger changes aren't mirrored in .claude/skills/verify/verify.sh gates.
- verify's lila gate is testQuick: run `./lila.sh --server --batch "scalafmtCheckAll; testFull"` yourself (~400 tests).
- Waiting on verify.sh with `pgrep -f verify.sh` self-matches the waiting shell: use the log mtimes / last-verify.

**How to apply:** any unit touching lila/build.sbt, project/*.scala or compose mounts. Related:
[[ci-review-patterns]], [[dev-script-review-patterns]], [[rating-maths-review-patterns]].
