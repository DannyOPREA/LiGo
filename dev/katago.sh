#!/usr/bin/env bash
# LiGo KataGo helper: install, smoke-test and benchmark KataGo (docs/CLAUDE_SETUP.md §12, unit 0.5).
# Run it as `dev/ligo katago <command>`.
#
#   install [cpu|opencl]  Download the pinned KataGo release for this backend (checksum-checked),
#                         unpack it and link it as ~/.local/bin/katago; fetch the small test network.
#                         Elsewhere it also fetches a full-size network (b18, ~100 MB); it stays
#                         UNVERIFIED (net_path refuses to use it) until NET_SHA256 below is pinned
#                         by the owner (unit 4.6: its licence needs reading on his box too, since
#                         katagotraining.org is unreachable from this cloud session).
#   smoke                 One analysis query on an empty-ish 19x19 board; checks KataGo answers with
#                         an ownership map (what the scoring phase will use).
#   bench                 `katago benchmark` (on OpenCL the first run also tunes the GPU); saves the
#                         report to .ligo/katago-benchmark.txt for the log.
#   path                  Print where the binary and networks live.
#   env                   Print KATAGO_BIN, KATAGO_TEST_NET and KATAGO_GTP_CONFIG as shell assignments
#                         (the differential test's KataGo: `dev/ligo differential`).
#
# LIGO_KATAGO_TEST_NET_ONLY=1 makes install skip the full-size network (CI, which needs only the
# test network).
#
# Backend: argument, else $LIGO_KATAGO_BACKEND, else cpu in cloud sessions and opencl elsewhere.
# Nothing here is committed: binaries and networks live under ~/.local (never in the repo).
#
# Licence: MIT (LiGo's own code, ADR 0006).

set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
KATAGO_VERSION=v1.18.1
# SHA-256 of the release zips, recorded when this version was pinned (unit 0.5). GitHub shows the
# same digests on the release page; a mismatch means the download is not what we tested.
declare -A ZIP_SHA256=(
  [cpu]=993b642601e806037003d11e43775e7b4fc65281aed9b9469b7122f18fc16811
  [opencl]=81ecea81526adb412a392ec728dbdf9627e754df7cf1a7a3dbb8ef220182184a
)
declare -A ZIP_NAME=([cpu]=eigen [opencl]=opencl)
# Small test network shipped inside KataGo's own repo (6 blocks, 3.8 MB), at the pinned tag's
# commit. Weak, but enough to smoke-test and to exercise ownership maps. Reachable from cloud
# sessions (raw.githubusercontent.com), unlike katagotraining.org.
KATAGO_COMMIT=92ee95c0a4b25fec214da00951ab69e97e207729
TEST_NET=g170-b6c96-s175395328-d26788732.bin.gz
TEST_NET_SHA256=f5d32604e3675c480c7c8f6aa579a1ea857135628a0afccc8fa56330fbacd38d
# Full-size network for the owner's box: the b18 network KataGo's README recommends. Its host
# (media.katagotraining.org) is not on the cloud allowlist, so cloud sessions skip it, and
# katagotraining.org/web.archive.org are also unreachable from this cloud session, so its
# licence could not be read here (unit 4.6: pending the owner pasting it, logs/scoring.md).
# TODO(owner, unit 4.6): after `dev/ligo katago install` downloads this network on your box, it
# prints its sha256 — paste that value in below and re-run install once to have it verified. Until
# NET_SHA256 is set, `net_path` (used by smoke/bench/env, so also by `dev/ligo scoring bench`)
# refuses to use this network and falls back to the test network, so an unverified download is
# never silently used for anything that matters (LIGO_KATAGO_ALLOW_UNVERIFIED=1 overrides this,
# for trying it before the checksum is pinned).
NET_NAME=${LIGO_KATAGO_NET:-kata1-b18c384nbt-s9996604416-d4316597426.bin.gz}
NET_SHA256=
NET_URL=https://media.katagotraining.org/uploaded/networks/models/kata1/$NET_NAME

BIN_DIR="$HOME/.local/bin"
OPT_DIR="$HOME/.local/opt"
NET_DIR="$HOME/.local/share/ligo/katago"
STATE="$ROOT/.ligo"

is_cloud() { [[ "${CLAUDE_CODE_REMOTE:-}" == "true" ]]; }
say() { printf '\033[1;34m[katago]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[katago] %s\033[0m\n' "$*" >&2; exit 1; }

backend() {
  local b=${1:-${LIGO_KATAGO_BACKEND:-}}
  if [[ -z "$b" ]]; then if is_cloud; then b=cpu; else b=opencl; fi; fi
  [[ -n "${ZIP_NAME[$b]:-}" ]] || die "backend must be cpu or opencl (got '$b')"
  echo "$b"
}

sha_ok() { echo "$2  $1" | sha256sum -c --quiet - >/dev/null 2>&1; }  # sha_ok <file> <sha256>

# Ours first: smoke and bench read the example configs next to the binary we installed.
katago_bin() { if [[ -x "$BIN_DIR/katago" ]]; then echo "$BIN_DIR/katago"; else command -v katago 2>/dev/null || true; fi; }

# True only when the full-size network is on disk AND checked against a pinned sha256 (unit 4.6:
# an unpinned NET_SHA256, or a mismatch, must never look the same as a verified network).
net_full_verified() {
  [[ -s "$NET_DIR/$NET_NAME" && -n "$NET_SHA256" ]] && sha_ok "$NET_DIR/$NET_NAME" "$NET_SHA256"
}

# The network to use: the full-size one if present and verified, else the test network — never an
# unverified full-size network, unless the owner opts in with LIGO_KATAGO_ALLOW_UNVERIFIED=1 (unit
# 4.6 decision: refuse by default rather than merely warn, since this choice feeds straight into
# the ≥ 97% accuracy gate). Warnings go to stderr so `net=$(net_path)` still captures only the path.
net_path() {
  if net_full_verified; then
    echo "$NET_DIR/$NET_NAME"
  elif [[ -s "$NET_DIR/$NET_NAME" ]]; then
    if [[ "${LIGO_KATAGO_ALLOW_UNVERIFIED:-}" == 1 ]]; then
      echo "[katago] WARNING: using UNVERIFIED network $NET_NAME (no sha256 pinned in dev/katago.sh yet, or it doesn't match); LIGO_KATAGO_ALLOW_UNVERIFIED=1 overrides the refusal" >&2
      echo "$NET_DIR/$NET_NAME"
    elif [[ -s "$NET_DIR/$TEST_NET" ]]; then
      echo "[katago] WARNING: $NET_NAME is on disk but UNVERIFIED (no pinned sha256, or a mismatch); refusing to use it, falling back to the test network. Paste its sha256 into dev/katago.sh's NET_SHA256 to pin it, or set LIGO_KATAGO_ALLOW_UNVERIFIED=1 to use it anyway." >&2
      echo "$NET_DIR/$TEST_NET"
    else
      die "$NET_NAME is on disk but UNVERIFIED (no pinned sha256) and no test network is available either: run dev/ligo katago install"
    fi
  elif [[ -s "$NET_DIR/$TEST_NET" ]]; then
    echo "$NET_DIR/$TEST_NET"
  else
    die "no network found in $NET_DIR: run dev/ligo katago install"
  fi
}

cmd_install() {
  local b; b=$(backend "${1:-}")
  local zip="katago-$KATAGO_VERSION-${ZIP_NAME[$b]}-linux-x64.zip"
  local dir="$OPT_DIR/katago-$KATAGO_VERSION-$b"
  [[ "$(uname -m)" == x86_64 ]] || die "KataGo publishes Linux builds for x86_64 only"
  command -v unzip >/dev/null || die "unzip not found (dnf/apt install unzip)"
  mkdir -p "$BIN_DIR" "$OPT_DIR" "$NET_DIR"

  # The configs are copied in before the final move, so a complete install has both.
  if [[ -x "$dir/AppRun" && -f "$dir/analysis_example.cfg" ]]; then
    say "KataGo $KATAGO_VERSION ($b) already installed"
  else
    TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
    say "downloading $zip"
    curl -fsSL --max-time 180 -o "$TMP/$zip" "https://github.com/lightvector/KataGo/releases/download/$KATAGO_VERSION/$zip"
    sha_ok "$TMP/$zip" "${ZIP_SHA256[$b]}" || die "checksum mismatch for $zip"
    (cd "$TMP" && unzip -q "$zip" -d zip)
    # The binary is an AppImage. Unpacking it avoids needing FUSE (absent in containers).
    (cd "$TMP/zip" && ./katago --appimage-extract >/dev/null)
    cp "$TMP/zip/"*.cfg "$TMP/zip/squashfs-root/"   # example configs (analysis, gtp) for smoke and bench
    rm -rf "$dir"
    mv "$TMP/zip/squashfs-root" "$dir"
  fi
  local ver
  if ! ver=$("$dir/AppRun" version 2>&1); then
    printf '%s\n' "$ver" >&2
    if [[ "$b" == opencl ]]; then die "katago won't start: the OpenCL build needs the system OpenCL loader (Fedora: dnf install ocl-icd clinfo)"; fi
    die "katago won't start (output above)"
  fi
  ln -sfn "$dir/AppRun" "$BIN_DIR/katago"   # only once it starts, so a broken build never replaces a working one
  say "$(head -1 <<<"$ver"), $(grep -m1 backend <<<"$ver")"

  if [[ -s "$NET_DIR/$TEST_NET" ]] && sha_ok "$NET_DIR/$TEST_NET" "$TEST_NET_SHA256"; then
    say "test network present"
  else
    say "downloading test network $TEST_NET"
    curl -fsSL --max-time 120 -o "$NET_DIR/$TEST_NET.part" \
      "https://raw.githubusercontent.com/lightvector/KataGo/$KATAGO_COMMIT/cpp/tests/models/$TEST_NET"
    sha_ok "$NET_DIR/$TEST_NET.part" "$TEST_NET_SHA256" || { rm -f "$NET_DIR/$TEST_NET.part"; die "checksum mismatch for $TEST_NET"; }
    mv "$NET_DIR/$TEST_NET.part" "$NET_DIR/$TEST_NET"
  fi

  if is_cloud; then
    say "cloud session: using the test network only (katagotraining.org isn't on the allowlist)"
  elif [[ "${LIGO_KATAGO_TEST_NET_ONLY:-}" == 1 ]]; then
    say "LIGO_KATAGO_TEST_NET_ONLY=1: skipping the full-size network"
  elif [[ -s "$NET_DIR/$NET_NAME" ]]; then
    # Re-checked every run, not just on first download: NET_SHA256 may have been filled in since
    # (unit 4.6) after an earlier UNVERIFIED download, and a file that predates the pin, or was
    # changed on disk, must not silently pass as verified from here on.
    if [[ -n "$NET_SHA256" ]]; then
      sha_ok "$NET_DIR/$NET_NAME" "$NET_SHA256" \
        && say "network $NET_NAME present and verified against the pinned sha256" \
        || die "network $NET_NAME on disk does not match the sha256 pinned in dev/katago.sh; delete $NET_DIR/$NET_NAME and run install again"
    else
      say "network $NET_NAME present but UNVERIFIED (no sha256 pinned yet in dev/katago.sh; smoke/bench/scoring bench fall back to the test network until it is, or set LIGO_KATAGO_ALLOW_UNVERIFIED=1)"
    fi
  else
    say "downloading network $NET_NAME (~100 MB)"
    if curl -fSL --progress-bar -o "$NET_DIR/$NET_NAME.part" "$NET_URL"; then
      if [[ -n "$NET_SHA256" ]]; then
        sha_ok "$NET_DIR/$NET_NAME.part" "$NET_SHA256" || { rm -f "$NET_DIR/$NET_NAME.part"; die "checksum mismatch for $NET_NAME"; }
      fi
      mv "$NET_DIR/$NET_NAME.part" "$NET_DIR/$NET_NAME"
      [[ -n "$NET_SHA256" ]] || say "UNVERIFIED (no pinned checksum yet): sha256 $(sha256sum "$NET_DIR/$NET_NAME" | cut -d' ' -f1); paste it (and the network's licence, from katagotraining.org, unreachable from this cloud session) into the unit 4.6 thread so it gets pinned. Until then smoke/bench/scoring bench use the test network instead (LIGO_KATAGO_ALLOW_UNVERIFIED=1 overrides this)."
    else
      rm -f "$NET_DIR/$NET_NAME.part"
      say "WARN: could not download $NET_URL; smoke and bench will use the test network"
    fi
  fi
}

installed_dir() { dirname "$(readlink -f "$(katago_bin)")"; }

cmd_smoke() {
  local k; k=$(katago_bin); [[ -n "$k" ]] || die "katago not installed: run dev/ligo katago install"
  local net; net=$(net_path)
  local cfg; cfg="$(installed_dir)/analysis_example.cfg"
  mkdir -p "$STATE"   # KataGo creates logDir but not its parents
  say "analysis query with $(basename "$net")"
  local out err="$STATE/katago-smoke.err"
  out=$(echo '{"id":"ligo-smoke","moves":[["B","Q16"],["W","D4"]],"rules":"japanese","komi":6.5,"boardXSize":19,"boardYSize":19,"maxVisits":50,"includeOwnership":true}' \
    | timeout 300 "$k" analysis -config "$cfg" -model "$net" \
        -override-config "numAnalysisThreads=1,numSearchThreadsPerAnalysisThread=2,logToStderr=false,logDir=$STATE/katago-logs" 2>"$err" \
    | head -1) || true
  python3 - "$out" <<'EOF' || die "smoke test failed; KataGo answered: ${out:-nothing}; its stderr: $(tail -5 "$err")"
import json, sys
d = json.loads(sys.argv[1])
assert d["id"] == "ligo-smoke", d
assert len(d["ownership"]) == 361, "ownership map should cover all 361 points"
assert d["rootInfo"]["visits"] >= 50, d["rootInfo"]
print(f"  ok: {d['rootInfo']['visits']} visits, best move {d['moveInfos'][0]['move']}, "
      f"score lead {d['rootInfo']['scoreLead']:+.1f}, ownership map of {len(d['ownership'])} points")
EOF
}

cmd_bench() {
  local k; k=$(katago_bin); [[ -n "$k" ]] || die "katago not installed: run dev/ligo katago install"
  local net; net=$(net_path)
  local out="$STATE/katago-benchmark.txt"
  mkdir -p "$STATE"
  rm -f "$out"   # written only when the benchmark succeeds, so doctor never counts a failed run
  say "benchmarking with $(basename "$net") (OpenCL tunes the GPU on its first run; this can take minutes)"
  {
    echo "# LiGo KataGo benchmark, $(date -u +%Y-%m-%dT%H:%MZ)"
    echo "# host: $(uname -srm); cpu: $(awk -F': ' '/model name/ {print $2; exit}' /proc/cpuinfo), $(nproc) threads"
    if command -v clinfo >/dev/null; then echo "# opencl devices: $(clinfo -l 2>/dev/null | grep -i device | sed 's/^[^A-Za-z]*//' | paste -sd ';' -)"; fi
    "$k" version | sed 's/^/# /'
    echo "# network: $(basename "$net")"
    # Run from .ligo: the gtp config logs to ./gtp_logs.
    (cd "$STATE" && "$k" benchmark -model "$net" -config "$(installed_dir)/default_gtp.cfg" -v "${LIGO_KATAGO_BENCH_VISITS:-800}" 2>&1) \
      | tr '\r' '\n' | grep -vE 'positions, visits/s = [^ ]+ \([0-9.]+ secs\) *$'
  } | tee "$out.part"
  mv "$out.part" "$out"
  say "saved to ${out#"$ROOT"/}"
}

cmd_path() {
  echo "binary:   $(katago_bin)"
  echo "networks: $NET_DIR"
  find "$NET_DIR" -maxdepth 1 -name '*.bin.gz' -printf '  %f\n' 2>/dev/null
}

# KATAGO_TEST_NET is always the small test network (the differential test reads only KataGo's
# legality mask, board and count, never its judgement, so it always uses that one). KATAGO_NET is
# `net_path`'s choice (unit 4.6): the full-size network if installed and verified, else the test
# network too — what `dev/ligo scoring bench` uses by default.
cmd_env() {
  local k; k=$(katago_bin); [[ -n "$k" ]] || die "katago not installed: run dev/ligo katago install"
  [[ -s "$NET_DIR/$TEST_NET" ]] || die "test network missing: run dev/ligo katago install"
  local net; net=$(net_path)
  printf 'KATAGO_BIN=%q\nKATAGO_TEST_NET=%q\nKATAGO_NET=%q\nKATAGO_GTP_CONFIG=%q\n' \
    "$k" "$NET_DIR/$TEST_NET" "$net" "$(installed_dir)/default_gtp.cfg"
}

case "${1:-help}" in
  install) shift; cmd_install "$@" ;;
  smoke) cmd_smoke ;;
  bench) cmd_bench ;;
  path) cmd_path ;;
  env) cmd_env ;;
  help|-h|--help) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//' ;;
  *) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2 ;;
esac
