---
name: dev-script-review-patterns
description: Recurring bugs when reviewing dev/*.sh helpers (katago.sh, cloud-setup.sh, session-start plan) in LiGo
metadata:
  type: project
---

Seen reviewing unit 0.5 (dev/katago.sh, 2026-09-27):
- Scripts write into `$ROOT/.ligo/...` without `mkdir -p "$STATE"`; tools like KataGo create only the
  leaf dir. Test by copying the script into a scratch "fake repo" path (with a space) that has no .ligo.
- `$(cmd | head -1)` inside a `say` argument hides failures even under `set -e`; binaries with a
  missing shared lib (e.g. libOpenCL.so.1 not bundled in KataGo's AppImage) "install" fine.
- stderr sent to /dev/null makes failures opaque ("answered: nothing").
- Cloud setup steps without `timeout` can blow the 300 s setup budget; SessionStart plans are one
  `&&` chain, so a new step's failure also skips `dev/ligo db`.
- Implementers pre-write STATUS "merged (PR #N)" and list decisions "for the owner to confirm in the
  PR" — conflicts with ADR 0011 self-merge (no pending owner question); check logs/decisions.md.

**Why:** none of these were caught by the implementer's verify run (all gates green).
**How to apply:** on any dev/ tooling diff, run the fake-repo-with-space test and grep for unbounded curl.

Seen re-reviewing unit 4.5 fixes (start_bg_restart + docker `scoring` service, 2026-09-29):
- Test process supervisors empirically: extract start_bg/stop_bg/start_bg_restart with sed into a
  scratch lib.sh, run a TERM-trapping child in a path with a space; check `ps -g <pgid>` and leftovers.
  stop_bg SIGKILLs the group right after TERM because the wrapper bash dies instantly, so children
  never finish graceful shutdown (pre-existing, also true for lila/lila-ws).
- Supervisor pid = loop, so `status` says "running" during a crash loop; backoff never resets.
- New compose services copied from `ui`: check CI=1 (pnpm no-TTY purge prompt), `init:` for PID 1
  signals, `:z` vs the other services' plain mounts, `pnpm install` re-run on every restart.
- Implementers attribute choices to "the reviewer's decision"; the reviewer decides nothing.
- Docker daemon isn't running in cloud sessions: `docker compose config` works, `up` can't be tested.
