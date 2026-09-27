#!/usr/bin/env bash
# Checks that the strategygames jar sbt resolved is the one LiGo pinned (ADR 0012): PlayStrategy's
# Maven repo is unsigned and coursier only checks the SHA-1 files that repo serves itself, so a
# changed artifact would otherwise go unnoticed. Run after sbt has resolved (CI's rules job,
# /verify). The same SHA-256 is recorded in docs/UPSTREAM.md.
# Licence: MIT (LiGo's own code, ADR 0006).
set -euo pipefail

jar=strategygames_3-10.2.1-s3-ps14.jar
want=682916195761758d8a4849abdf60deb121d10b0f412c5ea43986fe4ae3de261f
cache=${COURSIER_CACHE:-$HOME/.cache/coursier/v1}

found=$(find "$cache" -name "$jar" -path '*Mind-Sports-Games*' 2>/dev/null | head -1)
[[ -n "$found" ]] || { echo "check-pin: $jar not in $cache; run sbt update in libs/go-rules first" >&2; exit 1; }
got=$(sha256sum "$found" | cut -d' ' -f1)
if [[ "$got" != "$want" ]]; then
  echo "check-pin: $jar has SHA-256 $got, pinned $want (docs/UPSTREAM.md). Do not use it; ask the owner." >&2
  exit 1
fi
echo "check-pin: $jar matches the pinned SHA-256"
