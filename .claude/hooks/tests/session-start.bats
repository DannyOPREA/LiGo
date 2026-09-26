#!/usr/bin/env bats
# session-start.sh orients Claude from docs/STATUS.md and plans background preparation.
load helpers

setup() { make_repo; cd "$REPO"; export LIGO_SESSION_START_BG=0; }
start() { hook session-start.sh "$(json session_id s1 cwd "$REPO" source startup)"; }

@test "prints the current unit, open questions and the unit's log files" {
  start
  [ "$status" -eq 0 ]
  [[ "$output" == *"0.9 Test unit"* ]]
  [[ "$output" == *"Answer the question."* ]]
  [[ "$output" == *"logs/general.md logs/tooling.md"* ]]
}

@test "records the session's starting commit for stop-gate.sh" {
  start
  [ "$(cat .claude/state/sessions/s1)" = "$(git rev-parse HEAD)" ]
  git commit -q --allow-empty -m later
  start
  [ "$(cat .claude/state/sessions/s1)" != "$(git rev-parse HEAD)" ]  # a resume keeps the start
}

@test "--after-compact re-prints only the orientation" {
  run bash -c 'printf "{}" | "$1" --after-compact' _ "$HOOKS/session-start.sh"
  [ "$status" -eq 0 ]
  [[ "$output" == *"0.9 Test unit"* ]]
  [[ "$output" != *"Environment:"* ]]
}

@test "in the cloud, plans dependency install when the manifests changed" {
  export CLAUDE_CODE_REMOTE=true
  start
  [[ "$output" == *"cloud session"* ]]
  [[ "$output" == *"dev/ligo deps"* ]]
}

@test "survives a repo without STATUS.md" {
  rm docs/STATUS.md
  start
  [ "$status" -eq 0 ]
  [[ "$output" == *"none recorded"* ]]
}
