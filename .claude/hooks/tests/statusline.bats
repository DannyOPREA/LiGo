#!/usr/bin/env bats
# statusline.sh: branch · unit · last verify · waiting count.
load helpers

setup() { make_repo; cd "$REPO"; }
line() { hook statusline.sh "$(json workspace.project_dir "$REPO")"; }

@test "shows branch, unit, verify state and questions waiting" {
  line
  [ "$status" -eq 0 ]
  [[ "$output" == "claude/test · 0.9 Test unit · verify: never · 2 waiting on owner" ]]
}

@test "shows the last verify result" {
  mkdir -p .claude/state; echo "pass 1" > .claude/state/last-verify
  line
  [[ "$output" == *"verify: pass 0m ago"* ]]
}
