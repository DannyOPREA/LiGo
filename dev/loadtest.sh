#!/usr/bin/env bash
# LiGo load test (unit 6.9, ADR 0022 §10): k6 plays pool games against a running stack.
# Run it as `dev/ligo loadtest [run|install|path] [k6 args...]`.
#
#   install   Download the pinned k6 release into .ligo/k6/ (checksum-checked). k6 is a tool the
#             developer runs, not part of LiGo: no npm, sbt or repo dependency changes.
#   run       (default) Install if needed, then run dev/loadtest/pools.js against the stack:
#             PAIRS pairs of new players (default 10) each join the 9x9 3+2 pool, are paired,
#             play MOVES stones each (default 10) over the round websocket and one resigns.
#             Extra arguments go to `k6 run` (for example --summary-export FILE).
#   path      Print the k6 binary's path.
#
# The scenario signs up 2 x PAIRS accounts and starts many games from one address, so the stack
# needs lila's rate limits off: `net.ratelimit = false` in lila/conf/application.conf (the
# `loadtest` workflow does that; never on a public server). BASE_URL and WS_URL
# (lila and lila-ws) come from `dev/ligo`, for this mode.
#
# Licence: MIT (LiGo's own code, ADR 0006).

set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
K6_VERSION=v1.3.0
# SHA-256 of k6-$K6_VERSION-linux-amd64.tar.gz, as in the release's own checksums file, recorded when
# this version was pinned (unit 6.9).
K6_SHA256=84d26fc1f7bc03e02f2e016b3b1b20c032e05dfe461fca82de4e3a6ebe72ddbd
K6_DIR="$ROOT/.ligo/k6/$K6_VERSION"
K6_BIN="$K6_DIR/k6"

say() { printf '\033[1;34m[ligo]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[ligo] %s\033[0m\n' "$*" >&2; exit 1; }

install() {
  [[ -x "$K6_BIN" ]] && return
  [[ "$(uname -s)-$(uname -m)" == Linux-x86_64 ]] || die "the pinned k6 is linux-amd64 only; install k6 $K6_VERSION yourself and put it at $K6_BIN"
  local name="k6-$K6_VERSION-linux-amd64"
  local tmp
  tmp=$(mktemp -d)
  say "downloading k6 $K6_VERSION"
  curl -fsSL -o "$tmp/$name.tar.gz" "https://github.com/grafana/k6/releases/download/$K6_VERSION/$name.tar.gz"
  echo "$K6_SHA256  $tmp/$name.tar.gz" | sha256sum -c --quiet - || die "k6 download does not match the pinned checksum"
  tar -xzf "$tmp/$name.tar.gz" -C "$tmp"
  mkdir -p "$K6_DIR"
  mv "$tmp/$name/k6" "$K6_BIN"
  rm -rf "$tmp"
  say "k6 verified and installed at $K6_BIN"
}

cmd=${1:-run}
[[ $# -gt 0 ]] && shift
case "$cmd" in
  install) install ;;
  path) echo "$K6_BIN" ;;
  run)
    install
    base=${BASE_URL:-http://localhost:9663}
    say "load test against $base: ${PAIRS:-10} pairs, ${MOVES:-10} stones each"
    "$K6_BIN" run -e BASE_URL="$base" -e WS_URL="${WS_URL:-ws://localhost:9664}" -e PAIRS="${PAIRS:-10}" -e MOVES="${MOVES:-10}" -e TRACE="${TRACE:-0}" "$@" "$ROOT/dev/loadtest/pools.js"
    ;;
  *) die "usage: dev/ligo loadtest [run|install|path] [k6 args...]" ;;
esac
