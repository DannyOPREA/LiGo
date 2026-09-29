#!/usr/bin/env bash
# Runs the gates for what changed on this branch (vs origin/main, plus uncommitted and untracked
# files), prints a result table, and records the outcome in .claude/state/last-verify
# (read by stop-gate.sh and the status line). A failure is never turned into a pass.
#
# Usage: verify.sh [--all] [--list]
#   --all   run every gate, whatever changed
#   --list  print the gates that would run, run nothing, record nothing
# Full output of each gate: .claude/state/verify/<gate>.log
# Licence: MIT (LiGo's own code, ADR 0006).
set -uo pipefail

ROOT=$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)
STATE="$ROOT/.claude/state"
LOGS="$STATE/verify"
ALL=0 LIST=0
for a in "$@"; do case "$a" in --all) ALL=1 ;; --list) LIST=1 ;; *) echo "unknown option $a" >&2; exit 2 ;; esac; done

base=$(git -C "$ROOT" merge-base HEAD origin/main 2>/dev/null || git -C "$ROOT" rev-parse HEAD)
changed=$( { git -C "$ROOT" diff --name-only "$base" --; git -C "$ROOT" ls-files --others --exclude-standard; } | sort -u | sed '/^$/d')
code=$(grep -vE '\.md$' <<<"$changed")
has() { ((ALL)) || grep -qE "$1" <<<"$code"; }            # code changes (Markdown ignored)
has_any() { ((ALL)) || grep -qE "$1" <<<"$changed"; }     # any change
files() { grep -E "$1" <<<"$changed" | while IFS= read -r f; do [[ -f "$ROOT/$f" ]] && printf '%s\n' "$f"; done; }

gates=()   # "name|command" (command runs with bash -c from the repo root)
add() { gates+=("$1|$2"); }

if has '^\.claude/hooks/'; then add "hook tests (bats)" "bats .claude/hooks/tests"; fi
if has '^dev/'; then add "dev tooling checks" "dev/tests/run.sh"; fi
if ((ALL)); then sh_files=$(git -C "$ROOT" ls-files '*.sh' '.claude/hooks/*.sh' 'dev/ligo' | grep -v '^lila' ); else sh_files=$(files '(\.sh$|^dev/ligo$)' | grep -v '^lila'); fi
if [[ -n "$sh_files" ]] && command -v shellcheck >/dev/null; then
  add "shellcheck" "shellcheck -x -P SCRIPTDIR $(tr '\n' ' ' <<<"$sh_files")"
fi
if has '(^\.claude/settings\.json$|^\.mcp\.json$|\.json$)'; then
  add "JSON files parse" "for f in \$(git ls-files '*.json' ':!lila' ':!lila-ws'; git ls-files --others --exclude-standard '*.json'); do python3 -m json.tool \"\$f\" >/dev/null || { echo \"bad JSON: \$f\"; exit 1; }; done"
fi
if has_any '^\.claude/(agents|skills|rules)/'; then
  add "agent/skill/rule frontmatter" "python3 .claude/skills/verify/check_frontmatter.py"
fi
if has '^tools/claude-plugins/' && command -v claude >/dev/null; then
  add "plugin marketplace" "claude plugin validate tools/claude-plugins"
fi
ui=$(files '^lila/ui/.*\.(ts|mts|js|mjs|scss|css)$' | sed 's|^lila/||')
if ((ALL)) || [[ -n "$ui" ]] || has '^lila/(package\.json|pnpm-lock\.yaml|ui/.*/package\.json)$'; then
  if [[ -n "$ui" ]] && ! ((ALL)); then
    add "ui format (oxfmt)" "cd lila && node_modules/.bin/oxfmt --check $(tr '\n' ' ' <<<"$ui")"
    ts=$(grep -E '\.(ts|mts|js|mjs)$' <<<"$ui" | tr '\n' ' ')
    [[ -n "$ts" ]] && add "ui lint (oxlint)" "cd lila && node_modules/.bin/oxlint $ts"
    css=$(grep -E '\.(scss|css)$' <<<"$ui" | tr '\n' ' ')
    [[ -n "$css" ]] && add "ui lint (stylelint)" "cd lila && node_modules/.bin/stylelint $css"
  else
    add "ui format + lint" "cd lila && pnpm check-format && pnpm lint"
  fi
  add "ui tests (vitest)" "dev/ligo test ui"
fi
if has '^lila/(modules|app|conf|project|build\.sbt)'; then
  add "lila compile" "dev/ligo compile lila"
  add "lila scalafmt" "cd lila && ./lila.sh --server --batch scalafmtCheckAll"
  add "lila tests" "dev/ligo test lila"
fi
if has '^lila-ws/'; then add "lila-ws tests" "dev/ligo test ws"; fi
if has '^libs/go-rules/|^libs/board/|^libs/conformance/fixtures/|^dev/ligo$'; then
  add "go-rules scalafmt" "cd libs/go-rules && sbt --server --batch scalafmtCheckAll"
  add "go-rules + board: pin, tests, fixtures, parity" "dev/ligo test rules"
fi
if has '^libs/conformance/|^libs/go-rules/|^libs/board/' && [[ -x "$ROOT/libs/conformance/fast-check.sh" ]]; then
  add "conformance (fast)" "libs/conformance/fast-check.sh"
fi
if has '^services/scoring/|^libs/conformance/fixtures/|^dev/katago\.sh$|^dev/ligo$'; then
  add "scoring: typecheck, lint, tests" "dev/ligo test scoring"
fi
if has '^tools/puzzles/|^services/scoring/|^libs/board/|^dev/katago\.sh$|^dev/ligo$'; then
  add "puzzles: typecheck, lint, tests, check" "dev/ligo test puzzles"
fi

if ((LIST)); then
  if ((${#gates[@]})); then printf '%s\n' "${gates[@]%%|*}"; else echo "(no gates for these changes)"; fi
  exit 0
fi

mkdir -p "$LOGS"
if ((${#gates[@]} == 0)); then
  echo "No gates apply: only docs/logs/Markdown changed."
  echo "pass $(date +%s) $(git -C "$ROOT" rev-parse --short HEAD) no-gates" > "$STATE/last-verify"
  exit 0
fi

overall=pass
rows=()
for g in "${gates[@]}"; do
  name=${g%%|*}; cmd=${g#*|}
  log="$LOGS/$(tr ' /()+' '______' <<<"$name").log"
  start=$(date +%s)
  if (cd "$ROOT" && bash -c "$cmd") >"$log" 2>&1; then res=pass; else res=FAIL; overall=fail; fi
  secs=$(( $(date +%s) - start ))
  rows+=("$(printf '| %-28s | %-4s | %5ss | %s |' "$name" "$res" "$secs" "$(tail -1 "$log" | cut -c1-70)")")
  if [[ $res == FAIL ]]; then
    printf '\n--- %s FAILED; last lines of %s:\n' "$name" "${log#"$ROOT"/}"; tail -25 "$log"
  fi
done

echo
printf '| %-28s | %-4s | %6s | %s |\n' Gate Res Time "Last line of output"
echo "|------------------------------|------|--------|------|"
printf '%s\n' "${rows[@]}"
echo "$overall $(date +%s) $(git -C "$ROOT" rev-parse --short HEAD)" > "$STATE/last-verify"
echo
echo "Overall: $overall (recorded in .claude/state/last-verify; full logs in .claude/state/verify/)"
[[ $overall == pass ]]
