#!/usr/bin/env bash
# Tells a CI workflow which parts of the repo a change touches, so a pull request that only edits
# docs doesn't spend 20 minutes compiling lila. Used by .github/workflows/*.yml (unit 0.6).
#
# Usage: changed.sh <base-commit> [head-commit]
#   Prints one "area=true|false" line per area (append it to $GITHUB_OUTPUT), and the changed
#   files to stderr. When in doubt, run everything: every area is true without a usable base
#   commit (a push to main, a manual run), and when a changed file is neither in an area nor on
#   the no-build list below (e.g. a new libs/ or services/ folder).
#
# Licence: MIT (LiGo's own code, ADR 0006).
set -euo pipefail

base=${1:-}
head=${2:-HEAD}

# area|regex over repo-relative paths. A workflow file counts for its own area. Any lila/ change
# counts for ui, because lila's oxfmt and oxlint also check files outside ui/ (Markdown included).
# lila's pnpm lockfile and workspace also count for rules: libs/board's packages live there (unit 2.1).
# libs/board also counts for ui: the playground's screenshots (unit 2.4) run in the ui job.
# tools/puzzles imports services/scoring's KataGo client and libs/board's SGF reader (unit 8.3).
areas=(
  'lila|^(lila/(app|conf|modules|project|translation)/|lila/(build\.sbt|lila\.sh|\.sbtopts\.default|\.scalafmt\.conf|\.scalafix\.conf)$|\.github/workflows/lila\.yml$|dev/ci/changed\.sh$)'
  'ws|^(lila-ws/|\.github/workflows/lila\.yml$|dev/ci/changed\.sh$)'
  'ui|^(lila/|libs/board/|\.github/workflows/ui\.yml$|dev/ci/changed\.sh$)'
  'rules|^(libs/go-rules/|libs/board/|libs/conformance/fixtures/|lila/pnpm-(lock|workspace)\.yaml$|\.github/workflows/rules\.yml$|dev/ci/changed\.sh$)'
  'scoring|^(services/scoring/|libs/conformance/fixtures/|lila/pnpm-(lock|workspace)\.yaml$|dev/katago\.sh$|\.github/workflows/scoring\.yml$|dev/ci/changed\.sh$)'
  'puzzles|^(tools/puzzles/|services/scoring/|libs/board/|lila/pnpm-(lock|workspace)\.yaml$|dev/katago\.sh$|\.github/workflows/puzzles\.yml$|dev/ci/changed\.sh$)'
)

# Paths that never need a build: docs, logs, Claude config, repo meta files, dev tooling and the
# rules fixtures (both of which meta.yml tests; fixtures also count for the rules area), CI workflows and top-level Markdown or licence files.
no_build='^(docs/|logs/|\.claude/|\.github/|dev/|libs/conformance/|tools/claude-plugins/|[^/]+\.md$|LICENSE|\.gitignore$|\.mcp\.json$)'

if [[ -z "$base" ]] || ! git cat-file -e "$base^{commit}" 2>/dev/null; then
  echo "no base commit; every area counts as changed" >&2
  for a in "${areas[@]}"; do echo "${a%%|*}=true"; done
  exit 0
fi

# --no-renames: a moved file counts for both its old and its new path.
changed=$(git diff --name-only --no-renames "$base" "$head" --)
printf 'changed files:\n%s\n' "$changed" >&2
unknown=$(grep -vE "$no_build" <<<"$changed" || true)
for a in "${areas[@]}"; do unknown=$(grep -vE "${a#*|}" <<<"$unknown" || true); done
if [[ -n "$unknown" ]]; then
  printf 'files outside every area, so everything runs:\n%s\n' "$unknown" >&2
  for a in "${areas[@]}"; do echo "${a%%|*}=true"; done
  exit 0
fi
for a in "${areas[@]}"; do
  if grep -qE "${a#*|}" <<<"$changed"; then echo "${a%%|*}=true"; else echo "${a%%|*}=false"; fi
done
