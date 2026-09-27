#!/usr/bin/env bash
# PreToolUse(Edit|Write|MultiEdit|NotebookEdit): protects the rules spec, accepted ADRs,
# generated files and log history. Logic in lib/guard_paths.py.
# Licence: MIT (LiGo's own code, ADR 0006).
exec python3 "$(dirname "${BASH_SOURCE[0]}")/lib/guard_paths.py"
