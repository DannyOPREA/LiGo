---
name: ask
description: The standard way for LiGo work to stop and ask the owner - records the question in docs/STATUS.md, asks with options and a recommendation, and logs the answer. Use whenever a major decision comes up or you are unsure, instead of guessing.
---

# /ask

Unsure means stop and ask (docs/PLAN.md §7): ambiguous requirement, trade-offs between two
reasonable approaches, a fix that would change a test or fixture, an uncertain rules
interpretation, something surprising, or relying on an unverified fact.

1. Write the question under "## Waiting on owner" in `docs/STATUS.md`: one line of context, the
   options, and your recommendation with its reason.
2. Ask the owner. Use AskUserQuestion if available (options short, recommended one first);
   otherwise ask plainly in the conversation. The owner often answers from a phone: make it
   answerable in one tap or word.
3. Meanwhile continue only work that doesn't depend on the answer, and say what you're doing.
4. When answered: remove it from "Waiting on owner", add a line to `logs/decisions.md`
   (date, question, answer, record), and, if it is a major decision, write an ADR (/adr).
