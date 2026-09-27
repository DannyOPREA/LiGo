#!/usr/bin/env bash
# LiGo cloud environment setup script (Claude Code on the web).
#
# This file is the versioned copy of the script pasted into the "ligo" cloud environment's
# "Setup script" box (docs/CLAUDE_SETUP.md §12.1). It must stay self-contained (it may run before
# the repo is cloned), idempotent, and finish inside the 5-minute setup limit.
#
# What it does (machine-level only):
#   1. Node 24 + pnpm (via corepack)            -> ~/.local/bin/{node,npm,npx,corepack,pnpm}
#   2. sbt 2.x from the official GitHub tarball  -> ~/.local/bin/sbt
#   3. ADR 0008 dependency sources: ~/.sbt/repositories, coursier mirror.properties and
#      -Dsbt.override.build.repos=true in sbt's own conf/sbtopts (no repo file is touched)
#   4. docker pull of the images `dev/ligo` uses in native mode (Mongo, Redis); the apt packages
#      bats and shellcheck, for the hook tests and /verify (best effort)
#   5. If the repo is present: KataGo's CPU build and small test network (`dev/ligo katago install
#      cpu`, unit 0.5), then, if time allows, `dev/ligo deps` (warm caches, mirror cross-check,
#      pnpm install with the ab-stub workaround). Best effort; both can be rerun in the session.
#
# Licence: MIT (LiGo's own code, ADR 0006).

set -euo pipefail

NODE_VERSION=24.20.0        # matches lila/.node-version
SBT_VERSION=2.0.9           # matches lila/project/build.properties and lila-ws's
PNPM_VERSION=12.3.4         # matches lila/package.json packageManager
MONGO_IMAGE=mongo:7.0.28-jammy
REDIS_IMAGE=redis:8.0.3-alpine3.21
GOOGLE_CENTRAL=https://maven-central.storage-download.googleapis.com/maven2
BIN_DIR="$HOME/.local/bin"
OPT_DIR="$HOME/.local/opt"
START=$SECONDS
BUDGET=${LIGO_SETUP_BUDGET:-270}   # seconds; the platform kills the script at 300

log() { printf '[ligo-setup %3ds] %s\n' "$((SECONDS - START))" "$*"; }

mkdir -p "$BIN_DIR" "$OPT_DIR"

# ---------------------------------------------------------------------------------------------
# 1. Node + pnpm
install_node() {
  local dir="$OPT_DIR/node-v$NODE_VERSION"
  if [[ -x "$dir/bin/node" ]]; then
    log "node $NODE_VERSION already installed"
  else
    local arch; case "$(uname -m)" in x86_64) arch=x64 ;; aarch64) arch=arm64 ;; *) echo "unsupported arch" >&2; exit 1 ;; esac
    local tarball="node-v$NODE_VERSION-linux-$arch.tar.xz" tmp; tmp=$(mktemp -d)
    log "downloading $tarball"
    curl -fsSL -o "$tmp/$tarball" "https://nodejs.org/dist/v$NODE_VERSION/$tarball"
    curl -fsSL -o "$tmp/SHASUMS256.txt" "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt"
    (cd "$tmp" && grep " $tarball\$" SHASUMS256.txt | sha256sum -c --quiet -)
    tar -xJf "$tmp/$tarball" -C "$OPT_DIR"
    mv "$OPT_DIR/node-v$NODE_VERSION-linux-$arch" "$dir"
    rm -rf "$tmp"
  fi
  for b in node npm npx corepack; do ln -sf "$dir/bin/$b" "$BIN_DIR/$b"; done
  export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
  "$BIN_DIR/corepack" enable --install-directory "$BIN_DIR" pnpm
  PATH="$BIN_DIR:$PATH" "$BIN_DIR/corepack" install -g "pnpm@$PNPM_VERSION" >/dev/null
  log "node $("$BIN_DIR/node" --version), pnpm $(PATH="$BIN_DIR:$PATH" pnpm --version)"
}

# ---------------------------------------------------------------------------------------------
# 2. sbt (coursier's native launcher ignores the proxy truststore; see logs/tooling.md)
install_sbt() {
  local dir="$OPT_DIR/sbt-$SBT_VERSION"
  if [[ -x "$dir/bin/sbt" ]]; then
    log "sbt $SBT_VERSION already installed"
  else
    local base="https://github.com/sbt/sbt/releases/download/v$SBT_VERSION" tmp; tmp=$(mktemp -d)
    log "downloading sbt $SBT_VERSION"
    curl -fsSL -o "$tmp/sbt.tgz" "$base/sbt-$SBT_VERSION.tgz"
    local want; want=$(curl -fsSL "$base/sbt-$SBT_VERSION.tgz.sha256" | awk '{print $1}')
    echo "$want  $tmp/sbt.tgz" | sha256sum -c --quiet -
    mkdir -p "$dir"
    tar -xzf "$tmp/sbt.tgz" -C "$dir" --strip-components=1
    rm -rf "$tmp"
  fi
  # ADR 0008: make every build use ~/.sbt/repositories instead of its own resolvers.
  if ! grep -qx -- '-Dsbt.override.build.repos=true' "$dir/conf/sbtopts" 2>/dev/null; then
    printf '%s\n' '# LiGo cloud (ADR 0008)' '-Dsbt.override.build.repos=true' >> "$dir/conf/sbtopts"
  fi
  ln -sf "$dir/bin/sbt" "$BIN_DIR/sbt"
  log "sbt launcher installed"
}

# ---------------------------------------------------------------------------------------------
# 3. Dependency sources (ADR 0008). Lists every resolver lila and lila-ws declare, with Maven
# Central replaced by Google's mirror and the dead oss.sonatype.org dropped, plus PlayStrategy's
# repo for strategygames (libs/go-rules, ADR 0012).
write_repo_config() {
  mkdir -p "$HOME/.sbt" "$HOME/.config/coursier"
  cat > "$HOME/.sbt/repositories" <<EOF
# Written by LiGo dev/cloud-setup.sh (ADR 0008). Cloud sessions only.
[repositories]
  local
  google-maven-central: $GOOGLE_CENTRAL/
  jitpack: https://jitpack.io
  lila-maven: https://raw.githubusercontent.com/lichess-org/lila-maven/master
  lila-maven-ornicar: https://raw.githubusercontent.com/ornicar/lila-maven/master
  ps-lila-maven: https://raw.githubusercontent.com/Mind-Sports-Games/lila-maven/master
  sonatype-central-snapshots: https://central.sonatype.com/repository/maven-snapshots/
  sbt-plugin-releases: https://repo.scala-sbt.org/scalasbt/sbt-plugin-releases/, [organization]/[module]/(scala_[scalaVersion]/)(sbt_[sbtVersion]/)[revision]/[type]s/[artifact](-[classifier]).[ext]
EOF
  cat > "$HOME/.config/coursier/mirror.properties" <<EOF
# Written by LiGo dev/cloud-setup.sh (ADR 0008). Cloud sessions only.
central.from=https://repo1.maven.org/maven2
central.to=$GOOGLE_CENTRAL
EOF
  log "wrote ~/.sbt/repositories and coursier mirror.properties"
}

# ---------------------------------------------------------------------------------------------
# 4. Images for native mode
pull_images() {
  if ! command -v docker >/dev/null; then log "docker not found; skipping image pulls"; return; fi
  if ! docker info >/dev/null 2>&1; then
    log "starting docker daemon"
    # Fully detached: an attached dockerd keeps this script's stdout open and hangs the caller.
    command -v dockerd >/dev/null && { setsid nohup dockerd </dev/null >/tmp/dockerd.log 2>&1 & disown; }
    for _ in $(seq 30); do docker info >/dev/null 2>&1 && break; sleep 1; done
  fi
  for img in "$MONGO_IMAGE" "$REDIS_IMAGE"; do
    if docker image inspect "$img" >/dev/null 2>&1; then log "$img present"
    else log "pulling $img"; docker pull -q "$img" >/dev/null || log "WARN: could not pull $img"; fi
  done
}

install_test_tools() {
  if command -v bats >/dev/null && command -v shellcheck >/dev/null; then log "bats and shellcheck present"; return; fi
  command -v apt-get >/dev/null || { log "no apt-get; skipping bats/shellcheck"; return; }
  local sudo=""; [[ $(id -u) -ne 0 ]] && sudo="sudo -n"
  log "installing bats and shellcheck"
  { $sudo apt-get install -y -q bats shellcheck || { $sudo apt-get update -q && $sudo apt-get install -y -q bats shellcheck; }; } \
    >/tmp/ligo-apt.log 2>&1 || log "WARN: could not install bats/shellcheck (see /tmp/ligo-apt.log)"
}

# ---------------------------------------------------------------------------------------------
# 5. Repo-level dependencies, if the repo is here and there's time left
find_repo() {
  local d
  for d in "${CLAUDE_PROJECT_DIR:-}" "$PWD" "$HOME/LiGo" /home/user/LiGo /workspace/LiGo; do
    [[ -n "$d" && -x "$d/dev/ligo" && -d "$d/lila" ]] && { echo "$d"; return; }
  done
}

warm_repo() {
  local repo; repo=$(find_repo || true)
  if [[ -z "$repo" ]]; then log "repo not found; run dev/ligo deps in the session"; return; fi
  local left=$((BUDGET - (SECONDS - START)))
  log "installing KataGo (CPU build + test network)"
  timeout "$(( left > 120 ? 120 : left ))" "$repo/dev/katago.sh" install cpu \
    || log "WARN: KataGo install failed; rerun dev/ligo katago install"
  left=$((BUDGET - (SECONDS - START)))
  if (( left < 60 )); then log "only ${left}s left; skipping dev/ligo deps"; return; fi
  log "running dev/ligo deps in $repo (budget ${left}s)"
  if PATH="$BIN_DIR:$PATH" timeout "$left" "$repo/dev/ligo" deps; then log "dev/ligo deps done"
  else log "WARN: dev/ligo deps did not finish (exit $?); rerun it in the session"; fi
}

install_node
install_sbt
write_repo_config
pull_images
install_test_tools
warm_repo
log "done"
