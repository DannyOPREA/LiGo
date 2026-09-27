#!/usr/bin/env bash
# ok/bad/meh always return 0, so "A && ok || bad" is safe; "~" in messages is text.
# shellcheck disable=SC2015,SC2088
# LiGo doctor: checks this machine can run the dev stack (docs/CLAUDE_SETUP.md §12.2).
# Exit code 1 if anything required is missing. Run it as `dev/ligo doctor`.
#
# Licence: MIT (LiGo's own code, ADR 0006).

set -uo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
MODE=$("$ROOT/dev/ligo" mode)
is_cloud() { [[ "${CLAUDE_CODE_REMOTE:-}" == "true" ]]; }

FAILED=0 WARNED=0
ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; }
bad() { printf '  \033[31m✗\033[0m %s\n' "$*"; FAILED=$((FAILED + 1)); }
meh() { printf '  \033[33m!\033[0m %s\n' "$*"; WARNED=$((WARNED + 1)); }
# In native mode the JVM/Node toolchain is required; in docker mode it only helps (IDE, Claude).
need() { if [[ "$MODE" == native ]]; then bad "$@"; else meh "$@"; fi; }

ver_ge() { [[ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -1)" == "$2" ]]; }  # ver_ge have want

echo "LiGo doctor (mode: $MODE$(is_cloud && echo ', cloud session'))"

echo "Core"
if command -v docker >/dev/null; then
  if docker info >/dev/null 2>&1; then ok "docker $(docker version --format '{{.Server.Version}}' 2>/dev/null)"
  else bad "docker is installed but the daemon isn't reachable (is it running? are you in the docker group?)"; fi
  if docker compose version >/dev/null 2>&1; then ok "docker compose $(docker compose version --short)"
  else bad "docker compose v2 plugin missing"; fi
else
  bad "docker not found (https://docs.docker.com/engine/install/)"
fi
command -v git >/dev/null && ok "git $(git --version | awk '{print $3}')" || bad "git not found"
command -v curl >/dev/null && ok "curl" || bad "curl not found"
command -v python3 >/dev/null && ok "python3 $(python3 -c 'import platform; print(platform.python_version())')" \
  || bad "python3 not found (Claude Code's hooks in .claude/hooks need it)"

mem_gb=$(awk '/MemTotal/ {printf "%d", $2 / 1024 / 1024}' /proc/meminfo 2>/dev/null || echo 0)
if (( mem_gb >= 15 )); then ok "memory ${mem_gb} GB"
elif (( mem_gb >= 12 )); then meh "memory ${mem_gb} GB (lila needs ~12 GB to build; 16+ is comfortable)"
else bad "memory ${mem_gb} GB (lila needs ~12 GB to build)"; fi

disk_gb=$(df -Pk "$ROOT" | awk 'NR == 2 {printf "%d", $4 / 1024 / 1024}')
if (( disk_gb >= 20 )); then ok "free disk ${disk_gb} GB"
elif (( disk_gb >= 10 )); then meh "free disk ${disk_gb} GB (20+ recommended: images, caches, builds)"
else bad "free disk ${disk_gb} GB (need 10+)"; fi

echo "JVM and Node toolchain ($([[ $MODE == native ]] && echo required || echo 'optional in docker mode'))"
if command -v java >/dev/null; then
  jv=$(java -version 2>&1 | awk -F'"' '/version/ {print $2; exit}')
  if ver_ge "${jv%%.*}" 21; then ok "java $jv"; else need "java $jv (need 21+)"; fi
else need "java not found (need JDK 21+)"; fi
if command -v sbt >/dev/null; then
  sv=$(sbt --script-version 2>/dev/null | tail -1)
  if ver_ge "$sv" 2.0.0; then ok "sbt $sv"; else need "sbt ${sv:-?} (need 2.x)"; fi
else need "sbt not found (need 2.x; https://www.scala-sbt.org/download/)"; fi
want_node=$(tr -d 'v \n' < "$ROOT/lila/.node-version")
if command -v node >/dev/null; then
  nv=$(node --version | tr -d v)
  if ver_ge "$nv" "$want_node"; then ok "node $nv"; else need "node $nv (lila needs $want_node+)"; fi
else need "node not found (lila needs $want_node+)"; fi
want_pnpm=$(grep -oE '"packageManager": *"pnpm@[0-9.]+' "$ROOT/lila/package.json" | grep -oE '[0-9.]+$')
if command -v pnpm >/dev/null; then
  pv=$(cd "$ROOT/lila" && COREPACK_ENABLE_DOWNLOAD_PROMPT=0 pnpm --version 2>/dev/null | tail -1)
  if ver_ge "${pv:-0}" "${want_pnpm%%.*}"; then ok "pnpm $pv"; else need "pnpm ${pv:-?} (lila pins $want_pnpm; run: corepack enable)"; fi
else need "pnpm not found (run: corepack enable)"; fi

echo "Editor and Claude extras (optional)"
command -v cs >/dev/null && ok "coursier $(cs version 2>/dev/null)" || meh "coursier (cs) not found: the usual way to install sbt, scalafmt and Metals"
command -v scalafmt >/dev/null && ok "scalafmt $(scalafmt --version 2>/dev/null | awk '{print $2}')" \
  || meh "scalafmt CLI not found (sbt's scalafmt plugin still works: dev/ligo runs it through sbt)"
command -v typescript-language-server >/dev/null && ok "typescript-language-server" \
  || meh "typescript-language-server not found (npm i -g typescript-language-server typescript)"
command -v metals >/dev/null && ok "metals" || meh "metals not found (cs install metals)"
command -v bats >/dev/null && ok "bats $(bats --version | awk '{print $2}')" || meh "bats not found (hook tests: dnf/apt install bats)"
command -v shellcheck >/dev/null && ok "shellcheck" || meh "shellcheck not found (dnf/apt install ShellCheck/shellcheck)"

echo "KataGo (needed from the scoring phase; install with: dev/ligo katago install)"
kbin=$(command -v katago || { [[ -x "$HOME/.local/bin/katago" ]] && echo "$HOME/.local/bin/katago"; } || true)
if [[ -n "$kbin" ]]; then
  kv=$("$kbin" version 2>/dev/null | grep -E '^KataGo|backend' | paste -sd ',' - | sed 's/,/, /')
  if grep -qi opencl <<<"$kv"; then ok "katago with OpenCL: $kv"
  elif is_cloud; then ok "katago: $kv"
  else meh "katago found but not the OpenCL build: $kv (dev/ligo katago install opencl)"; fi
  if ls "$HOME/.local/share/ligo/katago/"*.bin.gz >/dev/null 2>&1; then
    ok "katago networks: $(find "$HOME/.local/share/ligo/katago" -maxdepth 1 -name '*.bin.gz' -printf '%f ')"
  else meh "no KataGo network (dev/ligo katago install)"; fi
else meh "katago not found (dev/ligo katago install)"; fi
if ! is_cloud; then
  if command -v clinfo >/dev/null; then
    gpus=$(clinfo -l 2>/dev/null | grep -ci device || true)
    if (( gpus > 0 )); then ok "OpenCL sees $gpus device(s)"; else meh "clinfo sees no OpenCL device (Fedora AMD: dnf install ocl-icd mesa-libOpenCL and export RUSTICL_ENABLE=radeonsi, or ROCm rocm-opencl)"; fi
  else meh "clinfo not found (dnf install clinfo), can't check OpenCL"; fi
  if grep -qi 'using opencl' "$ROOT/.ligo/katago-benchmark.txt" 2>/dev/null; then ok "KataGo OpenCL benchmark recorded (.ligo/katago-benchmark.txt)"
  else meh "no KataGo OpenCL benchmark yet (dev/ligo katago install opencl, then dev/ligo katago bench)"; fi
fi

if is_cloud; then
  echo "Cloud dependency sources (ADR 0008)"
  grep -q storage-download.googleapis.com "$HOME/.sbt/repositories" 2>/dev/null \
    && ok "~/.sbt/repositories uses Google's Central mirror" || bad "~/.sbt/repositories missing: run dev/cloud-setup.sh"
  grep -q '^central.to=' "$HOME/.config/coursier/mirror.properties" 2>/dev/null \
    && ok "coursier mirror.properties" || bad "coursier mirror.properties missing: run dev/cloud-setup.sh"
  sbt_home=$(dirname "$(dirname "$(readlink -f "$(command -v sbt)" 2>/dev/null)")" 2>/dev/null)
  grep -qx -- '-Dsbt.override.build.repos=true' "$sbt_home/conf/sbtopts" 2>/dev/null \
    && ok "sbt overrides build resolvers" || bad "sbt conf/sbtopts lacks -Dsbt.override.build.repos=true: run dev/cloud-setup.sh"
  if [[ -s "$ROOT/.ligo/mirror-verified.txt" ]]; then ok "$(wc -l < "$ROOT/.ligo/mirror-verified.txt") mirror artifacts cross-checked"
  else meh "no mirror artifacts cross-checked yet (dev/ligo deps does it)"; fi
fi

echo
if (( FAILED > 0 )); then echo "$FAILED problem(s), $WARNED warning(s)."; exit 1; fi
echo "All required checks passed ($WARNED warning(s))."
