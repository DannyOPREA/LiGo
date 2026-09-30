---
name: review-patterns-general
description: Recurring defects found reviewing LiGo units (licence rows for transitive deps, pipefail+find silent exits, docker-mode cache gaps, harness vacuity)
metadata:
  type: feedback
---

Things that slipped past authors more than once; check them on every review.

- New dependency: COPYING.md rows cover the direct dep but not NEW transitive jars (unit 1.7:
  joda-time ships META-INF/NOTICE.txt, Apache-2.0 needs it reproduced). Diff the classpath against
  lila's and `unzip -l` new jars for NOTICE.
  **Why:** COPYING §3 requires every dependency be listed and Apache NOTICEs reproduced.
  **How to apply:** any build.sbt/package.json change.
- `set -euo pipefail` + `x=$(find ... 2>/dev/null | head -1)` exits silently when find fails
  (missing dir): the friendly error message never prints. Test with a bogus path.
- Docker-mode commands using `dc run --rm` have no persistent coursier/sbt cache, and host-side
  checks (e.g. check-pin.sh reading ~/.cache/coursier) can't see what the container resolved.
- Fixture harnesses: verify with quick mutations in a scratchpad copy (not the repo) that each
  adapter feature is caught; also check unknown `expect` keys aren't silently ignored.
- Integrity checks (jar SHA pins) should run before tests execute the artifact, not after.
- "Uncommitted diff" units: the caller may commit to a wip branch and check out another branch
  mid-review. Before trusting a test rerun, check `git status`/`git reflog`; count the tests that
  ran against the `test(` lines you expect (a green run on the wrong branch looks identical).
