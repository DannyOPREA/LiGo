#!/usr/bin/env bash
# Notification: a desktop notification on the owner's machine when Claude needs attention.
# Cloud and Remote Control sessions already notify the phone, so this is local-only and quiet
# when there's no desktop (no notify-send, no display).
# Licence: MIT (LiGo's own code, ADR 0006).
set -uo pipefail
# shellcheck source=lib/common.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

is_cloud && exit 0
command -v notify-send >/dev/null || exit 0
[[ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]] || exit 0
msg=$(json_get message)
notify-send --app-name="Claude Code" "LiGo" "${msg:-Claude needs your attention}" 2>/dev/null || true
exit 0
