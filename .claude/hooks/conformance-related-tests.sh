#!/usr/bin/env bash
# PostToolUse(Edit|Write|MultiEdit), async with asyncRewake: when rules code, the board adapter
# or the conformance fixtures change, run the fast conformance subset in the background and wake
# Claude only if it fails (exit 2).
# The subset itself is libs/conformance/fast-check.sh, created by the first rules unit (Phase 1);
# until it exists this hook does nothing. LIGO_CONFORMANCE_CMD overrides it (used by the tests).
# Licence: MIT (LiGo's own code, ADR 0006).
set -uo pipefail
# shellcheck source=lib/common.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

ROOT=$(project_dir)
file=$(json_get tool_input.file_path)
[[ -n "$file" ]] || exit 0
rel=$(rel_path "$file" "$ROOT")
case "$rel" in
  libs/go-rules/*|libs/board/*|libs/conformance/*|docs/rules/*) ;;
  *) exit 0 ;;
esac

cmd=${LIGO_CONFORMANCE_CMD:-"$ROOT/libs/conformance/fast-check.sh"}
[[ -x "$cmd" ]] || exit 0

log=$(mktemp)
if (cd "$ROOT" && "$cmd") >"$log" 2>&1; then rm -f "$log"; exit 0; fi
{
  echo "Conformance fast check FAILED after editing $rel ($cmd). Last lines:"
  tail -40 "$log"
} >&2
rm -f "$log"
exit 2
