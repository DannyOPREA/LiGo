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

scripts=("$ROOT/dev/ligo" "$ROOT/dev/doctor.sh" "$ROOT/dev/cloud-setup.sh" "$ROOT/dev/mcp-playwright.sh" "$ROOT/dev/katago.sh" "$ROOT/dev/tests/run.sh" "$ROOT/dev/ci/changed.sh")
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
check "ligo katago help exits 0" "$LIGO" katago help
check "ligo katago with an unknown command fails" fails "$LIGO" katago no-such-command
check "katago install rejects an unknown backend" fails "$LIGO" katago install cuda

# CI helpers (dev/ci/, used by .github/workflows/): run against a throwaway repo.
ci_repo=$(mktemp -d)
trap 'rm -rf "$ci_repo"' EXIT
(
  cd "$ci_repo" && git init -q -b main && git config user.email t@example.com && git config user.name t
  mkdir -p logs lila/modules lila/ui lila-ws .github && echo base > README.md && git add -A && git commit -qm base
) >/dev/null 2>&1
ci_commit() { (cd "$ci_repo" && git checkout -q -B "$1" main && shift && for f in "$@"; do mkdir -p "$(dirname "$f")"; echo x >> "$f"; done && git add -A && git commit -qm c) >/dev/null 2>&1; }
in_ci_repo() { (cd "$ci_repo" && "$@"); }
META="$ROOT/dev/ci/meta_checks.py"
CHANGED="$ROOT/dev/ci/changed.sh"
ci_commit docs docs/x.md
check "changed.sh: a docs-only change needs no build" output_is $'lila=false\nws=false\nui=false' in_ci_repo "$CHANGED" main
check "log check: Markdown only passes" in_ci_repo "$META" logs main HEAD
ci_commit scala lila/modules/a.scala
check "changed.sh: lila/modules triggers the lila build only" output_is $'lila=true\nws=false\nui=false' in_ci_repo "$CHANGED" main
check "changed.sh: no base commit means build everything" output_is $'lila=true\nws=true\nui=true' in_ci_repo "$CHANGED" ""
check "log check: code without a logs/ entry fails" fails in_ci_repo "$META" logs main HEAD
ci_commit scala-logged lila/modules/a.scala logs/backend.md
check "log check: code with a logs/ entry passes" in_ci_repo "$META" logs main HEAD
ci_commit dep lila/package.json logs/tooling.md
check "changed.sh: lila/package.json triggers the ui build" output_is $'lila=false\nws=false\nui=true' in_ci_repo "$CHANGED" main
check "manifest check: package.json without COPYING.md fails" fails in_ci_repo "$META" manifests main HEAD
ci_commit dep-copying lila-ws/build.sbt COPYING.md
check "manifest check: build.sbt with COPYING.md passes" in_ci_repo "$META" manifests main HEAD
check "PR body: the bare template fails (empty sections)" fails env PR_BODY="$(cat "$ROOT/.github/pull_request_template.md")" "$META" pr-body "$ROOT/.github/pull_request_template.md"
filled=$(sed -E 's/^(## .*)$/\1\nn\/a/' "$ROOT/.github/pull_request_template.md")
check "PR body: every section filled passes" env PR_BODY="$filled" "$META" pr-body "$ROOT/.github/pull_request_template.md"
check "PR body: a missing section fails" fails env PR_BODY="$(grep -v '^## Risks' <<<"$filled")" "$META" pr-body "$ROOT/.github/pull_request_template.md"
check "licences: MIT, (MIT OR CC0-1.0) and GPL-3.0 pass" bash -c "echo '{\"MIT\":[],\"(MIT OR CC0-1.0)\":[],\"GPL-3.0\":[]}' | '$META' js-licences"
check "licences: GPL-2.0-only fails" fails bash -c "echo '{\"GPL-2.0-only\":[{\"name\":\"x\"}]}' | '$META' js-licences"
check "licences: (MIT AND SSPL-1.0) fails" fails bash -c "echo '{\"(MIT AND SSPL-1.0)\":[{\"name\":\"x\"}]}' | '$META' js-licences"

if command -v docker >/dev/null && docker compose version >/dev/null 2>&1; then
  check "compose.yml is valid" bash -c "cd '$ROOT/dev/lila-docker' && docker compose -f compose.yml --profile utils --profile mongo-express config -q"
  check "compose.native.yml is valid" bash -c "cd '$ROOT/dev/lila-docker' && docker compose -f compose.native.yml --profile redis config -q"
  check "compose.yml mounts LiGo's lila and lila-ws" bash -c "cd '$ROOT/dev/lila-docker' && docker compose -f compose.yml config | grep -q 'source: $ROOT/lila-ws' && docker compose -f compose.yml config | grep -q 'source: $ROOT/lila$'"
else
  echo "  skip  compose checks (docker compose not installed)"
fi

echo "$PASS passed, $FAIL failed"
(( FAIL == 0 ))
