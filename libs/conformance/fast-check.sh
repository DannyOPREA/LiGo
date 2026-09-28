#!/usr/bin/env bash
# The fast conformance subset: the fixture checker's own tests, then every fixture file checked for
# shape, ids and rule IDs (README.md). No engine needed. Run by /verify, by the PostToolUse hook
# conformance-related-tests.sh, and by CI (meta workflow). Units 1.7 and 1.8 add their engine
# harnesses here.
# Licence: MIT (LiGo's own code, ADR 0006).
set -euo pipefail
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
node --test "$HERE/check.test.mjs"
node "$HERE/check.mjs" "$@"
