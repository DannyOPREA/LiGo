---
name: explain
description: Explains a diff, PR or module in plain English for a reader new to Scala and lila. Use when the owner asks what something does or how it works, and for PR walkthroughs.
argument-hint: "[pr | path]"
---

# /explain [pr | path]

The owner is new to Scala and has little time. Explain $ARGUMENTS (default: this branch's diff
against origin/main):

1. **What it does** for a player or for the project, in two or three sentences.
2. **How the pieces fit**: the files involved and the path a request or move takes through them.
3. **Scala / lila idioms** that appear (Futures as `Fu`, givens, opaque types, macwire `Env`
   wiring, BSON handlers, snabbdom views), each explained once in a sentence, with the line it
   appears on.
4. **Where to look** to check it's right, and what could go wrong.

No jargon without a gloss. Prefer short paragraphs to long bullet lists.
