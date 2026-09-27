# shellcheck shell=bash
# Shared helpers for LiGo's hook scripts (sourced, not run).
# Licence: MIT (LiGo's own code, ADR 0006).

# The hook's JSON input, read once from stdin.
HOOK_INPUT=$(cat)

# json_get <dotted.key>: print a field of the hook input ("" if absent).
json_get() {
  python3 -c '
import json, sys
v = json.loads(sys.argv[1] or "{}")
for k in sys.argv[2].split("."):
    v = v.get(k) if isinstance(v, dict) else None
print("" if v is None else (json.dumps(v) if isinstance(v, (dict, list)) else v))
' "$HOOK_INPUT" "$1"
}

project_dir() {
  local d=${CLAUDE_PROJECT_DIR:-}
  [[ -n "$d" ]] || d=$(json_get cwd)
  [[ -n "$d" ]] || d=$PWD
  git -C "$d" rev-parse --show-toplevel 2>/dev/null || printf '%s\n' "$d"
}

is_cloud() { [[ "${CLAUDE_CODE_REMOTE:-}" == "true" ]]; }

# rel_path <absolute or relative path> <root>: path relative to root ("" if outside).
rel_path() {
  python3 -c '
import os, sys
root = os.path.realpath(sys.argv[2]); p = os.path.realpath(os.path.join(root, sys.argv[1]))
print(os.path.relpath(p, root) if p.startswith(root + os.sep) else "")
' "$1" "$2"
}
