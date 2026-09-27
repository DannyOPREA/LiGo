# Status

_Updated at the end of every session (`/status`). Newest information wins._

## Current unit
- 1.1 build-vs-buy for the server-side Go rules (started 2026-09-27, under the owner's standing
  "work autonomously" approval). Acceptance: a memo in docs/build-vs-buy/ backed by a spike, the
  owner's choice recorded as an ADR. Done: ADR 0012 (PR #9). Logs: logs/rules-engine.md.

## Now
- **Phase 0 — Claude Code setup + baseline.**
  - Units 0.1–0.3 merged (PRs #1–#3; #1 as a merge commit, #2–#3 squashed). `dev/ligo` runs the stack: docker mode on your
    machine (ADR 0010), native mode in cloud sessions. Baseline verified on your Linux box.
  - Unit 0.4 (Claude config): merged (PR #4, merge commit). Root and nested CLAUDE.md files, 8 path rules,
    `.claude/settings.json` (permissions + hooks), 8 hooks with 45 bats tests, 8 agents,
    16 skills, `.mcp.json` (Playwright, read-only Mongo, context7), a local plugin marketplace
    with a Metals LSP plugin. See `logs/tooling.md`.
  - Working agreement: Claude now squash-merges its own PRs once the checks pass (ADR 0011).
  - Unit 0.5 (environments): merged (PR #6). `dev/ligo katago install | smoke | bench` installs
    KataGo v1.18.1 (checksum-pinned), a network, and records a benchmark; the cloud setup script
    and the SessionStart hook install the CPU build; `dev/ligo doctor` checks KataGo, OpenCL and
    the benchmark. Cloud sessions use KataGo's small test network until katagotraining.org is
    allowed. The OpenCL benchmark on your box is still to run (below).
  - Unit 0.6 (CI): merged (PR #7). GitHub Actions runs `lila` (lila scalafmt + tests, lila-ws
    tests + check), `ui` (lint, format, build, tests, CodeQL) and `meta` (hook bats tests, dev/ checks,
    shellcheck, log check, COPYING.md-on-manifest-change, npm licences, PR template sections).
    Jobs for untouched areas are skipped. rules/e2e/nightly workflows come with later units.
  - `main` ruleset (you, 2026-09-27): PR required (0 approvals), the 9 CI jobs required. Checked on PR #8.
  - Unit 0.7 (dry run): rebrand lichess to LiGo: site name, page titles, AGPL source links, /source page (PR #8, merged).
- **Phase 1 — build-vs-buy + rules integration** started 2026-09-27; units listed in docs/PLAN.md §5.
  - Unit 1.1: server-side Go rules and byo-yomi clock come from strategygames as a pinned dependency
    with the other games excluded (ADR 0012, PR #9). The dependency lands with the adapter (1.7).
  - Unit 1.4 (ratings memo): docs/build-vs-buy/ratings.md recommends lila's own Glicko-2 configured
    like OGS plus ported goratings rank/handicap formulas; the spike matches OGS's numbers exactly.
    Waiting on your A / A2 answer.

## Next
- Phase 1 units 1.2–1.9 (docs/PLAN.md §5, "Phase 1 units"); next is 1.2, the client engine + board
  memo (OGS goban / goban-engine).
- Phase 0 acceptance items (CLAUDE_SETUP §14) not yet exercised: an /ask round-trip answered from
  your phone, a dependency-manifest edit hitting your permission prompt, and a Remote Control
  session starting oriented. They get exercised as Phase 1 units hit them.

## Waiting on owner
- Unit 1.4: ratings A (OGS's Glicko-2 settings, recommended) or A2 (lila's settings)? See the unit thread.
- Confirm the choices the spec left open in unit 0.4 (listed in PR #4).
- Paste `dev/cloud-setup.sh` into the cloud environment's Setup script (Project settings). It now
  also installs bats, shellcheck and KataGo (CPU).
- Cloud network allowlist: add `media.katagotraining.org` (full-size KataGo networks) and
  `mcp.context7.com` (the context7 MCP server).
- On your box: `dev/ligo katago install`, `dev/ligo katago smoke`, `dev/ligo katago bench`, then
  `dev/ligo doctor`; paste `.ligo/katago-benchmark.txt` and the network's sha256 into the unit 0.5
  thread so they get recorded (logs/scoring.md) and pinned.

## Blockers
- None.

## Known caveats
- `lila/AGENTS.md` (lichess's contributor guide) stays in the tree. Claude Code no longer loads it
  on its own now that CLAUDE.md files exist, and `lila/CLAUDE.md` says LiGo's rules win where it
  disagrees; `guard-bash.sh` blocks non-frozen `pnpm install`, cloud `sbt clean` and `bin/deploy`.
- Upstream non-free/NC assets remain in the tree until the first Phase 3 unit (COPYING.md §1.1).

## Phase progress
| Phase | State |
|---|---|
| 0. Claude setup + baseline | done (units 0.1–0.7, PRs #1–#8) |
| 1. Build-vs-buy + rules integration | 1.1 in progress (of 9 units) |
| 2–9 | not started |
