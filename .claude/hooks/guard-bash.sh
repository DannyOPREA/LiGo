#!/usr/bin/env bash
# PreToolUse(Bash): hard blocks in every permission mode. Logic in lib/guard_bash.py.
# Licence: MIT (LiGo's own code, ADR 0006).
exec python3 "$(dirname "${BASH_SOURCE[0]}")/lib/guard_bash.py"
