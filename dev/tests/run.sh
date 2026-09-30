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
# libs/board has no lockfile of its own (ADR 0017): pnpm must install it from lila/, in lila's workspace.
check "ligo installs libs/board only through lila's workspace" fails grep -nE 'libs/board.*pnpm install|BOARD.*pnpm install' "$LIGO"

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
check "changed.sh: a docs-only change needs no build" output_is $'lila=false\nws=false\nui=false\nrules=false\nscoring=false\npuzzles=false' in_ci_repo "$CHANGED" main
check "log check: Markdown only passes" in_ci_repo "$META" logs main HEAD
ci_commit scala lila/modules/a.scala
check "changed.sh: lila/modules triggers the lila and ui builds" output_is $'lila=true\nws=false\nui=true\nrules=false\nscoring=false\npuzzles=false' in_ci_repo "$CHANGED" main
check "changed.sh: no base commit means build everything" output_is $'lila=true\nws=true\nui=true\nrules=true\nscoring=true\npuzzles=true' in_ci_repo "$CHANGED" ""
check "log check: code without a logs/ entry fails" fails in_ci_repo "$META" logs main HEAD
ci_commit scala-logged lila/modules/a.scala logs/backend.md
check "log check: code with a logs/ entry passes" in_ci_repo "$META" logs main HEAD
ci_commit decisions-only lila/modules/a.scala logs/decisions.md
check "log check: logs/decisions.md alone isn't a log entry" fails in_ci_repo "$META" logs main HEAD
(cd "$ci_repo" && git checkout -q -B moved main && mkdir -p lila-ws/src && echo x > lila-ws/src/A.scala && git add -A && git commit -qm a \
  && git mv lila-ws/src/A.scala docs/A.scala && git commit -qm mv) >/dev/null 2>&1
check "changed.sh: moving a file out of lila-ws triggers the ws build" output_is $'lila=false\nws=true\nui=false\nrules=false\nscoring=false\npuzzles=false' in_ci_repo "$CHANGED" HEAD~1
ci_commit newlib tools/newthing/index.ts logs/general.md
check "changed.sh: a file outside every area runs everything" output_is $'lila=true\nws=true\nui=true\nrules=true\nscoring=true\npuzzles=true' in_ci_repo "$CHANGED" main
ci_commit rules libs/go-rules/src/Rules.scala logs/rules-engine.md
check "changed.sh: libs/go-rules triggers only the rules build" output_is $'lila=false\nws=false\nui=false\nrules=true\nscoring=false\npuzzles=false' in_ci_repo "$CHANGED" main
ci_commit toolingonly dev/x.sh .claude/y.json logs/tooling.md
check "changed.sh: dev/ and .claude/ changes need no build" output_is $'lila=false\nws=false\nui=false\nrules=false\nscoring=false\npuzzles=false' in_ci_repo "$CHANGED" main
ci_commit board libs/board/src/engine.mjs logs/rules-engine.md
check "changed.sh: libs/board triggers the rules, ui and puzzles builds (the playground screenshots; the puzzles' SGF reader)" output_is $'lila=false\nws=false\nui=true\nrules=true\nscoring=false\npuzzles=true' in_ci_repo "$CHANGED" main
ci_commit budget dev/ci/budget.json logs/frontend.md
check "changed.sh: the budget limits trigger only the ui build" output_is $'lila=false\nws=false\nui=true\nrules=false\nscoring=false\npuzzles=false' in_ci_repo "$CHANGED" main
ci_commit fixtures libs/conformance/fixtures/x.json logs/rules-engine.md
check "changed.sh: rules fixtures trigger the rules and scoring builds (the scoring service replays them too)" output_is $'lila=false\nws=false\nui=false\nrules=true\nscoring=true\npuzzles=false' in_ci_repo "$CHANGED" main
ci_commit dep lila/package.json logs/tooling.md
check "changed.sh: lila/package.json triggers the ui build" output_is $'lila=false\nws=false\nui=true\nrules=false\nscoring=false\npuzzles=false' in_ci_repo "$CHANGED" main
check "manifest check: package.json without COPYING.md fails" fails in_ci_repo "$META" manifests main HEAD
ci_commit lockfile lila/pnpm-lock.yaml logs/tooling.md
check "changed.sh: lila's pnpm lockfile triggers the ui, rules, scoring and puzzles builds (every workspace package outside lila/)" output_is $'lila=false\nws=false\nui=true\nrules=true\nscoring=true\npuzzles=true' in_ci_repo "$CHANGED" main
ci_commit scoring services/scoring/src/score.ts logs/scoring.md
check "changed.sh: services/scoring triggers the scoring and puzzles builds (tools/puzzles uses its KataGo client)" output_is $'lila=false\nws=false\nui=false\nrules=false\nscoring=true\npuzzles=true' in_ci_repo "$CHANGED" main
ci_commit puzzles tools/puzzles/src/cli.ts logs/tsumego.md
check "changed.sh: tools/puzzles triggers only the puzzles build" output_is $'lila=false\nws=false\nui=false\nrules=false\nscoring=false\npuzzles=true' in_ci_repo "$CHANGED" main
ci_commit puzzle-data tools/puzzles/data/generated-001.json logs/tsumego.md
check "changed.sh: the puzzle set triggers the puzzles and rules builds (libs/board plays every puzzle)" output_is $'lila=false\nws=false\nui=false\nrules=true\nscoring=false\npuzzles=true' in_ci_repo "$CHANGED" main
ci_commit katagosh dev/katago.sh logs/scoring.md
check "changed.sh: dev/katago.sh triggers the scoring and puzzles builds" output_is $'lila=false\nws=false\nui=false\nrules=false\nscoring=true\npuzzles=true' in_ci_repo "$CHANGED" main
ci_commit dep-copying lila-ws/build.sbt COPYING.md
check "manifest check: build.sbt with COPYING.md passes" in_ci_repo "$META" manifests main HEAD
ci_commit lib-plugins libs/go-rules/project/plugins.sbt logs/rules-engine.md
check "manifest check: a libs/ sbt plugin file without COPYING.md fails" fails in_ci_repo "$META" manifests main HEAD
check "PR body: the bare template fails (empty sections)" fails env PR_BODY="$(cat "$ROOT/.github/pull_request_template.md")" "$META" pr-body "$ROOT/.github/pull_request_template.md"
filled=$(sed -E 's/^(## .*)$/\1\nn\/a/' "$ROOT/.github/pull_request_template.md")
check "PR body: every section filled passes" env PR_BODY="$filled" "$META" pr-body "$ROOT/.github/pull_request_template.md"
check "PR body: a missing section fails" fails env PR_BODY="$(grep -v '^## Risks' <<<"$filled")" "$META" pr-body "$ROOT/.github/pull_request_template.md"
check "licences: MIT, (MPL-2.0 OR Apache-2.0) and GPL-3.0 pass" bash -c "echo '{\"MIT\":[{\"name\":\"a\"}],\"(MPL-2.0 OR Apache-2.0)\":[{\"name\":\"b\"}],\"GPL-3.0\":[{\"name\":\"c\"}]}' | '$META' js-licences"
check "licences: GPL-2.0-only fails" fails bash -c "echo '{\"GPL-2.0-only\":[{\"name\":\"x\"}]}' | '$META' js-licences"
check "licences: empty input fails" fails bash -c "echo '{}' | '$META' js-licences"
check "licences: (MIT AND SSPL-1.0) fails" fails bash -c "echo '{\"(MIT AND SSPL-1.0)\":[{\"name\":\"x\"}]}' | '$META' js-licences"

# `up` rebuilds the browser code when a source is newer than the build (a git pull that brought a
# new page), not only when there is no build. A fake tree, with a space in its path like the owner's.
ui_tree=$(mktemp -d)
trap 'rm -rf "$ci_repo" "$ui_tree"' EXIT
fake="$ui_tree/My LiGo"
mkdir -p "$fake/dev" "$fake/lila/ui/playground/src" "$fake/lila/ui/node_modules" "$fake/lila/public/compiled" "$fake/libs/board/src"
cp "$LIGO" "$fake/dev/ligo"
touch -d '2026-01-01' "$fake/lila/ui/playground/src/view.ts" "$fake/libs/board/src/board.ts"
ui_state_is() {  # status's later docker step fails in this fake tree, so only its output counts
  [[ "$(LIGO_MODE=native "$fake/dev/ligo" status 2>/dev/null)" == *"browser build: $1"* ]]
}
check "status: no manifest means the browser code isn't built" ui_state_is "not built"
touch -d '2026-01-02' "$fake/lila/public/compiled/manifest.json"
check "status: a build newer than every source is up to date" ui_state_is "up to date"
touch -d '2026-01-03' "$fake/lila/ui/node_modules/x.js"
check "status: node_modules changes don't make the build stale" ui_state_is "up to date"
touch -d '2026-01-03' "$fake/libs/board/src/board.ts"
check "status: a libs/board source newer than the build makes it stale" ui_state_is "out of date"
touch -d '2026-01-01' "$fake/libs/board/src/board.ts"
touch -d '2026-01-03' "$fake/lila/ui/playground/src/view.ts"
check "status: a lila/ui source newer than the build makes it stale" ui_state_is "out of date"

if command -v docker >/dev/null && docker compose version >/dev/null 2>&1; then
  check "compose.yml is valid" bash -c "cd '$ROOT/dev/lila-docker' && docker compose -f compose.yml --profile utils --profile mongo-express config -q"
  check "compose.native.yml is valid" bash -c "cd '$ROOT/dev/lila-docker' && docker compose -f compose.native.yml --profile redis config -q"
  # Every out-of-tree package in lila's pnpm workspace (../libs/board, ../services/scoring) must be
  # visible in the ui container, or its frozen install fails on the lockfile's importer for it.
  check "compose.yml's ui container mounts every ../ package of lila's pnpm workspace" bash -c "cd '$ROOT/dev/lila-docker' && cfg=\$(docker compose -f compose.yml --profile utils config ui) && for d in \$(sed -nE \"s#^ *- '\\.\\./([^/']+)/.*#\\1#p\" '$ROOT/lila/pnpm-workspace.yaml' | sort -u); do grep -q \"source: $ROOT/\$d\$\" <<<\"\$cfg\" || exit 1; done"
  check "compose.yml mounts LiGo's lila and lila-ws" bash -c "cd '$ROOT/dev/lila-docker' && docker compose -f compose.yml config | grep -q 'source: $ROOT/lila-ws' && docker compose -f compose.yml config | grep -q 'source: $ROOT/lila$'"
else
  echo "  skip  compose checks (docker compose not installed)"
fi

echo "$PASS passed, $FAIL failed"
(( FAIL == 0 ))
