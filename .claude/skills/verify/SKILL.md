---
name: verify
description: Runs LiGo's gates for the changed paths (tests, lint, format, compile, hook tests) and records the result for the stop gate. Use before saying any work is done, before every PR, and whenever the stop hook asks for it.
---

# /verify

Run:

```bash
bash .claude/skills/verify/verify.sh          # gates for what changed vs origin/main
bash .claude/skills/verify/verify.sh --list   # just show which gates would run
bash .claude/skills/verify/verify.sh --all    # every gate
```

It picks gates from the changed paths (hook tests, dev tooling checks, shellcheck, JSON,
frontmatter, plugin validation, ui format/lint/tests, lila compile/scalafmt/tests, lila-ws tests,
conformance), prints a table, and writes `.claude/state/last-verify`, which the stop gate and the
status line read.

Report the table as it is, with the real output. A failing gate stays failing: fix the cause and
rerun; never skip, weaken or delete a test to get green (that is an /ask situation). If a gate
can't run here (e.g. no Docker), say so and list it under "Needs your verification". Lila's full
test suite is slow; still run it when Scala changed.
