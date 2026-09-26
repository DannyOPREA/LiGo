---
name: adr
description: Writes a numbered Architecture Decision Record in docs/decisions/ and adds it to the index. Use after the owner approves a major decision.
disable-model-invocation: true
argument-hint: "\"title\""
---

# /adr "title"

1. Next number: one more than the highest `docs/decisions/NNNN-*.md`.
2. Write `docs/decisions/NNNN-<kebab-title>.md` using the template in `docs/decisions/README.md`
   (Status, Date, Decided by; Context, Decision, Consequences, Alternatives considered). Plain
   English; link the evidence (memo, log entry, PR).
3. Add the row to the table in `docs/decisions/README.md` and a line to `logs/decisions.md`.
4. To change an accepted decision, write a new ADR that supersedes it, then set the old one's
   status to `Superseded by NNNN`: that is the only edit a hook allows on an accepted ADR.
