# Status

_Updated at the end of every session (`/status`). Newest information wins._

## Current unit
- None. 0.5 environments merged (PR #6); next is 0.6 CI. Logs: logs/tooling.md, logs/scoring.md.

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

## Next
- 0.6 CI (incl. the hook tests in `meta.yml`) · 0.7 dry run.

## Waiting on owner
- Confirm the choices the spec left open in unit 0.4 (listed in PR #4).
- Paste `dev/cloud-setup.sh` into the cloud environment's Setup script (Project settings). It now
  also installs bats, shellcheck and KataGo (CPU).
- Cloud network allowlist: add `media.katagotraining.org` (full-size KataGo networks) and
  `mcp.context7.com` (the context7 MCP server).
- On your box: `dev/ligo katago install`, `dev/ligo katago smoke`, `dev/ligo katago bench`, then
  `dev/ligo doctor`; paste `.ligo/katago-benchmark.txt` and the network's sha256 into the unit 0.5
  thread so they get recorded (logs/scoring.md) and pinned.
- GitHub: add "Require a pull request before merging" to the `main` ruleset (it currently blocks
  only deletion and force-push). Leave "Required approvals" at 0: Claude merges its own PRs
  (ADR 0011) and GitHub doesn't let a PR's author approve it. Status checks come after CI (unit 0.6).

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
| 0. Claude setup + baseline | in progress (0.1–0.5 merged) |
| 1–9 | not started |
