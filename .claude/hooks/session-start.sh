#!/usr/bin/env bash
# SessionStart: get the machine ready and orient Claude, without flooding the context.
#   startup|resume   records where this session started (for stop-gate.sh), prints the current
#                    unit, what's waiting on the owner and which logs to read, checks tools, and
#                    starts in the background whatever is missing: dev/cloud-setup.sh (cloud),
#                    `dev/ligo deps` when the dependency manifests changed, KataGo (cloud, when
#                    ~/.local/bin/katago is missing) and `dev/ligo db`.
#   --after-compact  re-prints only the unit, open questions and log names.
# Stdout becomes context for Claude. Always exits 0: a broken hook must not block a session.
# Env: LIGO_SESSION_START_BG=0 prints the background plan without running it (tests use this);
#      LIGO_SESSION_START_DB=0 skips starting Mongo + Redis.
# Licence: MIT (LiGo's own code, ADR 0006).
set -uo pipefail
# shellcheck source=lib/common.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

ROOT=$(project_dir)
STATE="$ROOT/.claude/state"
STATUS="$ROOT/docs/STATUS.md"
mkdir -p "$STATE/sessions" 2>/dev/null

# section <heading>: print a "## heading" section of STATUS.md, without the heading.
section() { [[ -f "$STATUS" ]] && awk -v h="## $1" '$0==h{on=1;next} /^## /{on=0} on' "$STATUS" | sed '/^$/d'; }

orient() {
  echo "LiGo session context (from .claude/hooks/session-start.sh)"
  local unit waiting logs
  unit=$(section "Current unit")
  echo "Current unit:"; printf '%s\n' "${unit:-  (none recorded in docs/STATUS.md)}"
  waiting=$(section "Waiting on owner")
  echo "Waiting on the owner:"; printf '%s\n' "${waiting:-  nothing}"
  logs=$(grep -oE 'logs/[a-z-]+\.md' <<<"$unit" | sort -u | tr '\n' ' ')
  echo "Logs for this unit (read only their Lessons + latest ~5 entries): ${logs:-see logs/README.md map}"
}

if [[ "${1:-}" == "--after-compact" ]]; then orient; exit 0; fi

sid=$(json_get session_id)
if [[ -n "$sid" && ! -f "$STATE/sessions/$sid" ]]; then
  git -C "$ROOT" rev-parse HEAD > "$STATE/sessions/$sid" 2>/dev/null || true
fi

orient

# --- tools and background preparation ---------------------------------------------------------
node_major() { node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/'; }
missing=()
command -v java >/dev/null || missing+=(java)
command -v sbt >/dev/null || missing+=(sbt)
[[ "$(node_major)" -ge 24 ]] 2>/dev/null || missing+=("node>=24")
command -v pnpm >/dev/null || missing+=(pnpm)
command -v docker >/dev/null || missing+=(docker)

deps_hash() {
  (cd "$ROOT" && cat lila/pnpm-lock.yaml lila/build.sbt lila/project/*.scala lila-ws/build.sbt lila-ws/project/* 2>/dev/null) \
    | sha256sum | cut -d' ' -f1
}

plan=()
if is_cloud; then
  where=cloud
  if ((${#missing[@]})); then plan+=("dev/cloud-setup.sh"); fi
  # Seconds to install, and its failure must not stop the rest of the chain.
  [[ -x "${HOME:-/nonexistent}/.local/bin/katago" ]] \
    || plan+=("{ dev/ligo katago install cpu || echo 'WARN: KataGo install failed'; }")
  if [[ "$(cat "$ROOT/.ligo/deps-stamp" 2>/dev/null)" != "$(deps_hash)" ]]; then
    plan+=("dev/ligo deps && deps_hash > .ligo/deps-stamp")
  fi
else
  where=local
  ((${#missing[@]})) && echo "Missing tools on this machine: ${missing[*]}. Run dev/ligo doctor."
fi
if [[ "${LIGO_SESSION_START_DB:-1}" != 0 ]] && command -v docker >/dev/null; then plan+=("dev/ligo db"); fi

echo "Environment: $where session, dev/ligo mode $("$ROOT/dev/ligo" mode 2>/dev/null || echo unknown)."
((${#plan[@]})) || exit 0

pidf="$ROOT/.ligo/session-start.pid"
if [[ -f "$pidf" ]] && kill -0 "$(cat "$pidf")" 2>/dev/null; then
  echo "Background preparation already running (log: .ligo/logs/session-start.log)."
  exit 0
fi
joined=$(printf ' && %s' "${plan[@]}"); joined=${joined# && }
echo "Background preparation: $joined"
echo "  Log: .ligo/logs/session-start.log (ends with 'session-start: done' or 'FAILED'). Check it before building or running."
[[ "${LIGO_SESSION_START_BG:-1}" == 0 ]] && exit 0

mkdir -p "$ROOT/.ligo/logs"
export -f deps_hash
export ROOT
# Detach fully (setsid, no inherited stdout), or the session would wait on it (logs/tooling.md).
# shellcheck disable=SC2016 # expanded by the child bash
setsid nohup bash -c 'echo $$ > "$1"; cd "$ROOT" || exit 1; if eval "$2"; then echo "session-start: done"; else echo "session-start: FAILED"; fi; rm -f "$1"' \
  _ "$pidf" "$joined" </dev/null >"$ROOT/.ligo/logs/session-start.log" 2>&1 &
exit 0
