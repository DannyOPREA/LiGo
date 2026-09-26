---
name: next
description: Proposes the next LiGo unit for the owner's approval (goal, acceptance criteria, test plan, reuse plan, expected decisions, log). Use when the owner says "next", "continue", "what's next" or asks to start new work.
disable-model-invocation: true
argument-hint: "[unit id or topic]"
---

# /next: propose the next unit

Nothing starts without the owner's OK (docs/PLAN.md §7). This skill prepares that decision; it
never starts the work.

1. Read `docs/STATUS.md` (Now / Next / Waiting on owner), the roadmap (`docs/PLAN.md` §8 phases,
   `docs/CLAUDE_SETUP.md` §14 for Phase 0), open GitHub issues if a GitHub tool is available, and
   the **Lessons** section of the logs for the candidate unit's area (logs/README.md map).
   If $ARGUMENTS names a unit or topic, propose that one.
2. Pick the next unit in the plan's order. If items in "Waiting on owner" block it, say so and
   propose the best unblocked unit instead.
3. Present, in plain English:
   - **Goal** (one paragraph) and why now.
   - **Acceptance criteria** (checkable).
   - **Test plan** (which tests, which gates, what the owner will verify).
   - **Reuse plan**: existing software it builds on; anything custom and whether it needs /build-vs-buy.
   - **Decisions it expects to need** from the owner.
   - **Log file** it will write to.
4. Ask for approval (AskUserQuestion if available, otherwise a plain question): approve / change /
   pick something else. Recommend one.
5. Only after approval: create the GitHub issue (if a GitHub tool is available), set
   `docs/STATUS.md` "## Current unit" (first line `<id> <title> (approved YYYY-MM-DD)`, then
   acceptance criteria and a `Logs:` line), add a line to `logs/decisions.md`, then hand over to
   /ship.
