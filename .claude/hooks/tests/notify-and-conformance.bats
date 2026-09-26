#!/usr/bin/env bats
# notify.sh stays quiet where it can't notify; conformance-related-tests.sh runs only for rules
# paths and wakes Claude (exit 2) only on failure.
load helpers

setup() { make_repo; cd "$REPO"; }
edited() { hook conformance-related-tests.sh "$(json cwd "$REPO" tool_input.file_path "$REPO/$1")"; }

@test "notify is a no-op in cloud sessions" {
  export CLAUDE_CODE_REMOTE=true
  hook notify.sh "$(json message hi)"
  [ "$status" -eq 0 ]; [ -z "$output" ]
}

@test "conformance check ignores unrelated files" {
  export LIGO_CONFORMANCE_CMD="$BATS_TEST_TMPDIR/fail.sh"
  printf '#!/bin/sh\necho boom; exit 1\n' > "$LIGO_CONFORMANCE_CMD"; chmod +x "$LIGO_CONFORMANCE_CMD"
  edited lila/ui/lobby/src/ctrl.ts
  [ "$status" -eq 0 ]
}

@test "conformance check does nothing until the fast check exists" {
  edited libs/go-rules/src/Ko.scala
  [ "$status" -eq 0 ]
}

@test "conformance check wakes Claude with the failure" {
  export LIGO_CONFORMANCE_CMD="$BATS_TEST_TMPDIR/fail.sh"
  printf '#!/bin/sh\necho boom; exit 1\n' > "$LIGO_CONFORMANCE_CMD"; chmod +x "$LIGO_CONFORMANCE_CMD"
  edited libs/conformance/fixtures/ko-1.json
  [ "$status" -eq 2 ]; [[ "$output" == *boom* ]]
}

@test "conformance check is silent when it passes" {
  export LIGO_CONFORMANCE_CMD="$BATS_TEST_TMPDIR/ok.sh"
  printf '#!/bin/sh\necho fine\n' > "$LIGO_CONFORMANCE_CMD"; chmod +x "$LIGO_CONFORMANCE_CMD"
  edited libs/go-rules/src/Ko.scala
  [ "$status" -eq 0 ]; [ -z "$output" ]
}
