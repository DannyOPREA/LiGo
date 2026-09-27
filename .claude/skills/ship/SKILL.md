---
name: ship
description: Runs an approved LiGo unit end to end with hard checkpoints (build-vs-buy, failing tests, implementation, verify, review, play-test, log, PR). Use when the owner says to start or ship an approved unit.
disable-model-invocation: true
argument-hint: "[issue or unit id]"
---

# /ship: the unit loop

Each step is a checkpoint: don't skip one, and say which step you're on. **At any point**, a major
decision (docs/PLAN.md §7) or real uncertainty → /ask, then pause only the work that depends on
the answer.

1. **Confirm approval.** The unit ($ARGUMENTS, or "## Current unit" in docs/STATUS.md) must be
   approved in logs/decisions.md or by the owner in this conversation. If not, run /next instead.
2. **Reuse check.** List the components the unit needs. Any custom component beyond glue →
   /build-vs-buy, and wait for the owner's choice.
3. **Failing tests first.** Delegate to the `test-engineer` agent with the acceptance criteria.
   Show that the new tests fail for the right reason.
4. **Implement.** Delegate to the right agent (`lila-backend`, `lila-frontend`,
   `scoring-engineer`; rules questions to `go-rules-expert`), or do it yourself for small units.
   Work on a branch (`claude/...` or `feat/...`), never on main.
5. **/verify.** All gates green, with real output. Fix and repeat; never weaken a test.
6. **Review.** Run the `reviewer` agent on the diff (and `/security-review` if the unit touches
   auth, input handling or secrets). Fix every blocking finding, then /verify again.
7. **/play-test** for units that change the UI or game flow; keep the screenshots.
8. **/log** the unit in its area log (and logs/decisions.md for every question asked).
9. **Open the PR** with `.github/pull_request_template.md`: every section filled, a plain-English
   walkthrough for a Scala newcomer, and an honest "Needs your verification" list. Update
   docs/STATUS.md (/status). Never merge: the owner does.
