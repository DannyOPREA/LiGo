#!/usr/bin/env bats
# stop-gate.sh blocks "done" when code changed without a passing /verify and a log entry.
load helpers

setup() {
  make_repo; cd "$REPO"
  mkdir -p .claude/state/sessions
  git rev-parse HEAD > .claude/state/sessions/s1
}
stop() { hook stop-gate.sh "$(json session_id s1 cwd "$REPO" stop_hook_active "${1:-false}")"; }
verify_pass() { echo "pass $(date +%s)" > .claude/state/last-verify; }
add_log_entry() { printf '### 2026-09-27 · new\n' >> logs/tooling.md; }

@test "lets the stop through when nothing changed" {
  stop; [ "$status" -eq 0 ]
}

@test "lets the stop through when only docs and logs changed" {
  echo more >> docs/STATUS.md; add_log_entry; echo "# x" > notes.md
  stop; [ "$status" -eq 0 ]
}

@test "blocks when code changed with no verify and no log entry" {
  echo y >> code.txt
  stop; [ "$status" -eq 2 ]
  [[ "$output" == *"no passing /verify"* ]]; [[ "$output" == *"no logs/ entry"* ]]
}

@test "blocks when the only verify is older than the change" {
  verify_pass; add_log_entry
  touch -d '1 minute ago' .claude/state/last-verify
  echo y >> code.txt
  stop; [ "$status" -eq 2 ]; [[ "$output" == *"after the last passing /verify"* ]]
}

@test "blocks when verify failed" {
  echo "fail $(date +%s)" > .claude/state/last-verify; add_log_entry
  echo y >> code.txt
  stop; [ "$status" -eq 2 ]
}

@test "counts committed and untracked code, not just unstaged edits" {
  echo new > newfile.sh
  stop; [ "$status" -eq 2 ]
  git add -A && git commit -qm wip
  stop; [ "$status" -eq 2 ]
}

@test "lets the stop through after verify and a log entry" {
  echo y >> code.txt; add_log_entry
  sleep 1; verify_pass
  stop; [ "$status" -eq 0 ]
}

@test "blocks only once (stop_hook_active)" {
  echo y >> code.txt
  stop true; [ "$status" -eq 0 ]
}

@test "without a session marker, compares against origin/main" {
  rm .claude/state/sessions/s1
  git commit -qam "code change" --allow-empty
  echo y >> code.txt && git commit -qam change
  stop; [ "$status" -eq 2 ]
}
