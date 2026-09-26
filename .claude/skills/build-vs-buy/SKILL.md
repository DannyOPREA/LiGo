---
name: build-vs-buy
description: Runs the reuse-scout agent on a capability, presents the options with a recommendation, and records the owner's choice as an ADR. Use before writing any non-trivial LiGo component or adding, removing or swapping a dependency.
disable-model-invocation: true
argument-hint: "<capability>"
---

# /build-vs-buy <capability>

Reuse before build is a core LiGo rule (ADR 0002): a custom build beyond small glue needs a memo
and the owner's approval.

1. Run the `reuse-scout` agent on "$ARGUMENTS". It writes `docs/build-vs-buy/<topic>.md`.
2. Read the memo critically: check licences are stated exactly and AGPL-3.0-compatible, and that
   lila, OGS goban, strategygames, KataGo and goscorer were considered.
3. Present the options to the owner in plain English: a short table, the recommendation and the
   runner-up, and what each choice commits LiGo to. Ask (AskUserQuestion if available).
4. After the answer: write an ADR with /adr (status Accepted, "Decided by: owner"), add a line to
   `logs/decisions.md`, and note it in the unit's area log. If a dependency is added, update
   `COPYING.md` in the same PR.
