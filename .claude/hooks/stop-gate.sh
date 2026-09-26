#!/usr/bin/env bash
# Stop: no "done" without evidence. Blocks the stop once (exit 2; stop_hook_active lets the next
# stop through) when code changed in this session and either
#   - there's no passing /verify newer than the change (.claude/state/last-verify), or
#   - no logs/ file changed in this session.
# "Code" is any changed file except Markdown, docs/, logs/, .claude/agent-memory/ and .claude/state/.
# "This session" starts at the commit recorded by session-start.sh; without one, at the merge
# base with origin/main.
# Licence: MIT (LiGo's own code, ADR 0006).
set -uo pipefail
# shellcheck source=lib/common.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

[[ "$(json_get stop_hook_active)" == "True" || "$(json_get stop_hook_active)" == "true" ]] && exit 0
ROOT=$(project_dir)
git -C "$ROOT" rev-parse --git-dir >/dev/null 2>&1 || exit 0
STATE="$ROOT/.claude/state"
sid=$(json_get session_id)

base=""
[[ -n "$sid" && -f "$STATE/sessions/$sid" ]] && base=$(cat "$STATE/sessions/$sid")
[[ -n "$base" ]] || base=$(git -C "$ROOT" merge-base HEAD origin/main 2>/dev/null || true)
[[ -n "$base" ]] || exit 0

changed=$( { git -C "$ROOT" diff --name-only "$base" -- 2>/dev/null
             git -C "$ROOT" ls-files --others --exclude-standard 2>/dev/null; } | sort -u)
code=$(grep -vE '(\.md$|^docs/|^logs/|^\.claude/(agent-memory|state)/)' <<<"$changed" | sed '/^$/d')
[[ -n "$code" ]] || exit 0

reasons=()
stamp="$STATE/last-verify"
if [[ ! -f "$stamp" ]] || [[ "$(head -c4 "$stamp")" != "pass" ]]; then
  reasons+=("no passing /verify since the code changed")
else
  newest=0
  while IFS= read -r f; do
    [[ -f "$ROOT/$f" ]] || continue
    t=$(stat -c %Y "$ROOT/$f" 2>/dev/null || echo 0)
    (( t > newest )) && newest=$t
  done <<<"$code"
  (( newest > $(stat -c %Y "$stamp") )) && reasons+=("code changed after the last passing /verify")
fi
grep -qE '^logs/.+\.md$' <<<"$changed" || reasons+=("no logs/ entry written")

((${#reasons[@]})) || exit 0
{
  joined=$(printf '; %s' "${reasons[@]}")
  printf 'Code changed in this session (%s file(s)), but: %s.\n' "$(wc -l <<<"$code")" "${joined#; }"
  echo "Run /verify and /log, or state why not (e.g. the work is unfinished and you're handing over)."
} >&2
exit 2
