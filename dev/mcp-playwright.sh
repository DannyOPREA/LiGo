#!/usr/bin/env bash
# Starts the Playwright MCP server (.mcp.json) with a browser this machine actually has:
# cloud sessions ship a Chromium at /opt/pw-browsers/chromium; elsewhere Playwright MCP uses its
# own browser (install it once with: npx -y @playwright/mcp@0.0.82 install-browser chrome-for-testing).
# LIGO_CHROMIUM overrides the browser path.
# Licence: MIT (LiGo's own code, ADR 0006).
set -euo pipefail
args=(--headless --isolated)
chromium=${LIGO_CHROMIUM:-}
[[ -z "$chromium" && -x /opt/pw-browsers/chromium ]] && chromium=/opt/pw-browsers/chromium
[[ -n "$chromium" ]] && args+=(--browser chromium --executable-path "$chromium")
exec npx -y @playwright/mcp@0.0.82 "${args[@]}" "$@"
