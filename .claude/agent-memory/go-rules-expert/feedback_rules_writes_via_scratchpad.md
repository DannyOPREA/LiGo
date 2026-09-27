---
name: feedback-rules-writes-via-scratchpad
description: When the owner is away, draft docs/rules and fixture changes in the session scratchpad, not in place; the main session applies them in one write per file
metadata:
  type: feedback
---
Draft docs/rules/ (and fixture) content in the session scratchpad, finish it there, and hand the paths
back; the main session applies each file in a single write.

**Why:** each write to docs/rules/ or libs/conformance/fixtures/ waits on an owner permission prompt;
during unit 1.5 (2026-09-27) the owner was away and the coordinator redirected mid-task.

**How to apply:** ask or assume scratchpad drafting when the owner is not actively approving; if writing
in place, use one Write per file and no follow-up Edits.
