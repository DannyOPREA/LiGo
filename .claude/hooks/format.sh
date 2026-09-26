#!/usr/bin/env bash
# PostToolUse(Edit|Write|MultiEdit): format the touched file with the tools and configs its
# project already uses, then report what's still wrong (exit 2 sends it back to Claude).
#   lila/ TS, JS, JSON, SCSS, CSS  -> lila's oxfmt; then oxlint (TS/JS) or stylelint (SCSS/CSS)
#   *.scala under lila/ or lila-ws/ -> scalafmt with that project's .scalafmt.conf, if a scalafmt
#                                      binary is installed (otherwise /verify checks it via sbt)
#   *.sh and hook scripts           -> shellcheck, if installed
# Anything else is left alone. Missing tools are skipped silently: /verify is the real gate.
# Licence: MIT (LiGo's own code, ADR 0006).
set -uo pipefail
# shellcheck source=lib/common.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

ROOT=$(project_dir)
file=$(json_get tool_input.file_path)
[[ -n "$file" && -f "$file" ]] || exit 0
rel=$(rel_path "$file" "$ROOT")
[[ -n "$rel" ]] || exit 0
abs="$ROOT/$rel"
bin="$ROOT/lila/node_modules/.bin"
problems=""

note() { problems+="$1"$'\n'; }

case "$rel" in
  lila/node_modules/*|*/pnpm-lock.yaml|lila/public/compiled/*|lila/translation/dest/*) exit 0 ;;
esac

case "$rel" in
  lila/*.ts|lila/*.mts|lila/*.js|lila/*.mjs|lila/*.json|lila/*.scss|lila/*.css)
    if [[ -x "$bin/oxfmt" ]]; then
      out=$(cd "$ROOT/lila" && "$bin/oxfmt" "$abs" 2>&1) || note "oxfmt: $out"
    fi
    case "$rel" in
      *.ts|*.mts|*.js|*.mjs)
        if [[ -x "$bin/oxlint" ]]; then
          out=$(cd "$ROOT/lila" && "$bin/oxlint" "$abs" 2>&1) || note "oxlint:"$'\n'"$out"
        fi ;;
      *.scss|*.css)
        if [[ -x "$bin/stylelint" ]]; then
          out=$(cd "$ROOT/lila" && "$bin/stylelint" --fix "$abs" 2>&1) || note "stylelint:"$'\n'"$out"
        fi ;;
    esac ;;
  lila/*.scala|lila-ws/*.scala)
    project=${rel%%/*}
    if command -v scalafmt >/dev/null; then
      out=$(scalafmt --quiet --config "$ROOT/$project/.scalafmt.conf" "$abs" 2>&1) || note "scalafmt: $out"
    fi ;;
  *.sh|.claude/hooks/*|dev/ligo)
    if command -v shellcheck >/dev/null && head -1 "$abs" | grep -q bash; then
      out=$(shellcheck -x -P SCRIPTDIR "$abs" 2>&1) || note "shellcheck:"$'\n'"$out"
    fi ;;
esac

if [[ -n "$problems" ]]; then
  printf 'Formatting/lint problems remain in %s:\n%s' "$rel" "$problems" | head -60 >&2
  exit 2
fi
exit 0
