# Shared setup for the hook tests. Run all with: bats .claude/hooks/tests
# Licence: MIT (LiGo's own code, ADR 0006).

HOOKS="$(cd "$BATS_TEST_DIRNAME/.." && pwd)"

# A throwaway LiGo-shaped git repo with origin/main, checked out on a unit branch.
make_repo() {
  REPO="$BATS_TEST_TMPDIR/repo with space"
  local origin="$BATS_TEST_TMPDIR/origin.git"
  git init -q -b main "$REPO"
  git -C "$REPO" config user.email t@example.com
  git -C "$REPO" config user.name test
  mkdir -p "$REPO/docs/decisions" "$REPO/logs/archive" "$REPO/docs/rules"
  cat > "$REPO/docs/decisions/0001-accepted.md" <<'MD'
# 0001. Accepted thing
- Status: Accepted
- Date: 2026-09-26

## Decision
Do the thing.
MD
  cat > "$REPO/logs/tooling.md" <<'MD'
# Tooling log

## Lessons (curated, ≤ 30 lines — read this first)
- an old lesson

## Entries (newest first)
### 2026-09-26 · unit 0.3 · Something
- Did: things
- Worked: yes
MD
  cat > "$REPO/logs/general.md" <<'MD'
# General log

## Lessons (curated, ≤ 30 lines — read this first)
_none yet_

## Entries (newest first)
_none yet_
MD
  cat > "$REPO/logs/decisions.md" <<'MD'
# Decisions log

| Date | Question | Answer | Record |
|---|---|---|---|
| 2026-09-26 | First question? | Yes | ADR 0001 |
MD
  cat > "$REPO/docs/STATUS.md" <<'MD'
# Status

## Current unit
- 0.9 Test unit (approved 2026-09-26)
- Acceptance: it works
- Logs: logs/tooling.md, logs/general.md

## Waiting on owner
- Review the PR.
- Answer the question.

## Blockers
- None.
MD
  echo 'x' > "$REPO/code.txt"
  git -C "$REPO" add -A && git -C "$REPO" commit -qm init
  git clone -q --bare "$REPO" "$origin"
  git -C "$REPO" remote add origin "$origin"
  git -C "$REPO" fetch -q origin
  git -C "$REPO" checkout -q -b claude/test
  export CLAUDE_PROJECT_DIR="$REPO"
  unset CLAUDE_CODE_REMOTE
}

# hook <script> <json>: run a hook with JSON on stdin; sets $status and $output (stdout+stderr).
hook() {
  run bash -c 'printf "%s" "$1" | "$2"' _ "$2" "$HOOKS/$1"
}

# json <key> <value> [<key> <value>...]: build hook JSON; dotted keys nest, and the values
# true/false become booleans (e.g. json tool_name Edit tool_input.file_path x).
json() {
  python3 -c '
import json, sys
out, a = {}, sys.argv[1:]
for k, v in zip(a[::2], a[1::2]):
    d = out
    *parents, last = k.split(".")
    for p in parents:
        d = d.setdefault(p, {})
    d[last] = {"true": True, "false": False}.get(v, v)
print(json.dumps(out))' "$@"
}

bash_input() { json tool_name Bash cwd "$REPO" tool_input.command "$1"; }
