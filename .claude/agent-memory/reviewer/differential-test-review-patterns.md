---
name: differential-test-review-patterns
description: How to review oracle/differential harnesses (KataGo GTP lockstep, unit 1.9): mutate the oracle via a stdin-rewriting wrapper, check coverage floors, exit-code labelling
metadata:
  type: feedback
---

- Prove the harness can fail without editing the repo: wrap the oracle binary in a scratchpad
  script that rewrites its stdin (`sed -u 's/"ko":"SITUATIONAL"/"ko":"SIMPLE"/' | katago "$@"`,
  komi, suicide) and point KATAGO_BIN at it. Unit 1.9: all three mutations went red (rc=1).
  **Why:** fast, repo-untouched, and exercises the real comparison path.
- Look for comparisons that can silently drop to zero (e.g. "scores compared only on settled
  boards") with no floor asserted in the real run; the offline test may assert it but the nightly not.
- Internal errors (adapter refuses its own legal point) often land in a generic "incomplete / oracle
  failed" exit code with no SGF artifact; ask for them to be reported as disagreements.
- Eager evaluation of an expensive Either (`game.undo.toOption.filter(_ => roll == 0)`) in a hot loop.
- `if: failure()` artifact steps don't run on job timeout/cancel.
- PLAN §6 says rules-layer tests are "CI required"; a "not required" nightly is a plan deviation to flag.
