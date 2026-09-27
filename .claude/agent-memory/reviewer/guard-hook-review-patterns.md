---
name: guard-hook-review-patterns
description: Recurring weak spots when reviewing .claude/hooks/lib/guard_bash.py changes and working-agreement doc edits
metadata:
  type: project
---

Patterns seen reviewing guard_bash.py (2026-09-27, ADR 0011 branch):
- Flag checks compare whole words (`a == "--admin"`), so `--flag=value` forms (`--admin=true`,
  `--auto=true`, `--merge=true`) slip through; combined short flags (`-sd`) and flag-like option
  values (`-t "--merge"`) cause false blocks. Probe both directions by piping JSON into the .py.
- `bash -c "..."`, `xargs gh ...`, `gh api .../merge` are known best-effort gaps (hook docstring admits it).
- Working-agreement changes leave stragglers: grep PLAN §6 table ("Human check ... before merging"),
  CLAUDE_SETUP /ship row and hook table, not just the obvious "owner merges" phrases.
- Local origin/main may be stale, so `git diff origin/main...HEAD` can include already-merged units;
  check `git log --graph` and review only the unit's own commits.

**Why:** these were missed by the implementer's own bats tests.
**How to apply:** on any guard-hook or merge-policy diff, run the probe matrix before signing off.
