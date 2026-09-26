---
name: status
description: Updates docs/STATUS.md (Current unit, Now, Next, Waiting on owner, Blockers) at the end of a session or unit. Use when the owner asks for a status update or when wrapping up.
disable-model-invocation: true
---

# /status: update docs/STATUS.md

STATUS is loaded into every session (root CLAUDE.md imports it) and drives the status line and
the SessionStart hook, so keep it short, current and in its fixed shape:

- `## Current unit`: first line `<id> <title> (approved YYYY-MM-DD | in review | none)`, then the
  acceptance criteria in a few bullets and a `Logs:` line naming the unit's log files.
- `## Now`, `## Next`: a few bullets each; link PRs and logs rather than repeating them.
- `## Waiting on owner`: one bullet per open question or action, each answerable quickly; write
  "- Nothing." when empty (the status line counts bullets here).
- `## Blockers`, `## Known caveats`, `## Phase progress` as they are.

Newest information wins: remove finished items rather than piling up history (history lives in
logs/). Show the owner the diff of STATUS.md.
