#!/usr/bin/env bats
# format.sh: formats with the project's own tools and reports what's left.
load helpers

setup() { make_repo; cd "$REPO"; }
edited() { hook format.sh "$(json cwd "$REPO" tool_input.file_path "$REPO/$1")"; }

@test "ignores files it has no formatter for" {
  edited code.txt
  [ "$status" -eq 0 ]
}

@test "ignores a file that no longer exists" {
  edited gone.ts
  [ "$status" -eq 0 ]
}

@test "reports shellcheck problems in shell scripts" {
  command -v shellcheck >/dev/null || skip "shellcheck not installed"
  printf '#!/usr/bin/env bash\necho $1\n' > bad.sh
  edited bad.sh
  [ "$status" -eq 2 ]; [[ "$output" == *SC2086* ]]
  printf '#!/usr/bin/env bash\necho "$1"\n' > good.sh
  edited good.sh
  [ "$status" -eq 0 ]
}

@test "formats lila TypeScript with lila's own oxfmt" {
  lila="$HOOKS/../../lila"
  [[ -x "$lila/node_modules/.bin/oxfmt" ]] || skip "lila's node_modules not installed"
  mkdir -p lila/ui/x && ln -s "$(cd "$lila" && pwd)/node_modules" lila/node_modules
  cp "$lila/.oxfmtrc.json" lila/ 2>/dev/null || true
  printf 'const  a = {b:1}\nexport default a\n' > lila/ui/x/a.ts
  edited lila/ui/x/a.ts
  grep -q 'const a = { b: 1 };' lila/ui/x/a.ts
}
