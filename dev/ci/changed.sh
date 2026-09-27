#!/usr/bin/env bash
# Tells a CI workflow which parts of the repo a change touches, so a pull request that only edits
# docs doesn't spend 20 minutes compiling lila. Used by .github/workflows/*.yml (unit 0.6).
#
# Usage: changed.sh <base-commit> [head-commit]
#   Prints one "area=true|false" line per area (append it to $GITHUB_OUTPUT), and the changed
#   files to stderr. Without a usable base commit (a push to main, a manual run) every area is
#   true: when in doubt, run everything.
#
# Licence: MIT (LiGo's own code, ADR 0006).
set -euo pipefail

base=${1:-}
head=${2:-HEAD}

# area|regex over repo-relative paths. A workflow file counts for its own area.
areas=(
  'lila|^(lila/(app|conf|modules|project|translation)/|lila/(build\.sbt|lila\.sh|\.sbtopts\.default|\.scalafmt\.conf|\.scalafix\.conf)$|\.github/workflows/lila\.yml$|dev/ci/changed\.sh$)'
  'ws|^(lila-ws/|\.github/workflows/lila\.yml$|dev/ci/changed\.sh$)'
  'ui|^(lila/(ui|public|bin|translation)/|lila/(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|\.node-version|\.oxfmtrc\.json|\.oxlintrc\.jsonc|\.stylelintrc\.json)$|\.github/workflows/ui\.yml$|dev/ci/changed\.sh$)'
)

if [[ -z "$base" ]] || ! git cat-file -e "$base^{commit}" 2>/dev/null; then
  echo "no base commit; every area counts as changed" >&2
  for a in "${areas[@]}"; do echo "${a%%|*}=true"; done
  exit 0
fi

changed=$(git diff --name-only "$base" "$head" --)
printf 'changed files:\n%s\n' "$changed" >&2
for a in "${areas[@]}"; do
  if grep -qE "${a#*|}" <<<"$changed"; then echo "${a%%|*}=true"; else echo "${a%%|*}=false"; fi
done
