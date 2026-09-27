#!/usr/bin/env bash
# Status line: branch · unit · last /verify · questions waiting on the owner.
# Reads docs/STATUS.md ("## Current unit" first line, "## Waiting on owner" bullets) and
# .claude/state/last-verify. Must be fast and never fail.
# Licence: MIT (LiGo's own code, ADR 0006).
set -uo pipefail
# shellcheck source=lib/common.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

ROOT=$(json_get workspace.project_dir)
[[ -n "$ROOT" ]] || ROOT=$(project_dir)
STATUS="$ROOT/docs/STATUS.md"
branch=$(git -C "$ROOT" branch --show-current 2>/dev/null)
unit=""; waiting=0
if [[ -f "$STATUS" ]]; then
  unit=$(awk '$0=="## Current unit"{on=1;next} /^## /{on=0} on && NF{print; exit}' "$STATUS" \
    | sed -E 's/^[-*] *//; s/\*\*//g; s/ \(.*//' | cut -c1-40)
  waiting=$(awk '$0=="## Waiting on owner"{on=1;next} /^## /{on=0} on && /^- /' "$STATUS" | grep -vc '^- *[Nn]othing' || true)
fi
verify="verify: never"
stamp="$ROOT/.claude/state/last-verify"
if [[ -f "$stamp" ]]; then
  age=$(( ( $(date +%s) - $(stat -c %Y "$stamp") ) / 60 ))
  verify="verify: $(head -c4 "$stamp") ${age}m ago"
fi
printf '%s · %s · %s · %s waiting on owner\n' "${branch:-detached}" "${unit:-no unit}" "$verify" "$waiting"
