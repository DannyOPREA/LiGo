#!/usr/bin/env bash
# Fast checks for the dev/ tooling (no stack needed): shellcheck, the ligo command's argument
# handling and mode selection, and that both compose files are valid. CI runs this (unit 0.6).
#
# Licence: MIT (LiGo's own code, ADR 0006).

set -uo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
LIGO="$ROOT/dev/ligo"
PASS=0 FAIL=0

check() {  # check <description> <command...>
  local desc=$1; shift
  if "$@" >/dev/null 2>&1; then PASS=$((PASS + 1)); printf '  ok    %s\n' "$desc"
  else FAIL=$((FAIL + 1)); printf '  FAIL  %s\n' "$desc"; fi
}
fails() { ! "$@"; }
output_is() { [[ "$("${@:2}" 2>/dev/null)" == "$1" ]]; }  # output_is <expected> <command...>

echo "dev/ tooling checks"

scripts=("$ROOT/dev/ligo" "$ROOT/dev/doctor.sh" "$ROOT/dev/cloud-setup.sh" "$ROOT/dev/mcp-playwright.sh" "$ROOT/dev/tests/run.sh")
for s in "${scripts[@]}"; do check "bash -n ${s#"$ROOT"/}" bash -n "$s"; done
if command -v shellcheck >/dev/null; then check "shellcheck" shellcheck "${scripts[@]}"
else echo "  skip  shellcheck (not installed)"; fi

check "ligo help exits 0" "$LIGO" help
check "ligo with an unknown command fails" fails "$LIGO" no-such-command
check "LIGO_MODE must be docker or native" fails env LIGO_MODE=podman "$LIGO" mode
check "mode defaults to native in cloud sessions" output_is native env -u LIGO_MODE CLAUDE_CODE_REMOTE=true "$LIGO" mode
check "mode defaults to docker elsewhere" output_is docker env -u LIGO_MODE -u CLAUDE_CODE_REMOTE "$LIGO" mode
check "LIGO_MODE overrides the default" output_is docker env LIGO_MODE=docker CLAUDE_CODE_REMOTE=true "$LIGO" mode
check "compile rejects an unknown target" fails "$LIGO" compile nonsense
check "test rejects an unknown target" fails "$LIGO" test nonsense

if command -v docker >/dev/null && docker compose version >/dev/null 2>&1; then
  check "compose.yml is valid" bash -c "cd '$ROOT/dev/lila-docker' && docker compose -f compose.yml --profile utils --profile mongo-express config -q"
  check "compose.native.yml is valid" bash -c "cd '$ROOT/dev/lila-docker' && docker compose -f compose.native.yml --profile redis config -q"
  check "compose.yml mounts LiGo's lila and lila-ws" bash -c "cd '$ROOT/dev/lila-docker' && docker compose -f compose.yml config | grep -q 'source: $ROOT/lila-ws' && docker compose -f compose.yml config | grep -q 'source: $ROOT/lila$'"
else
  echo "  skip  compose checks (docker compose not installed)"
fi

echo "$PASS passed, $FAIL failed"
(( FAIL == 0 ))
