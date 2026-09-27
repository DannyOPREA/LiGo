# Status

_Updated at the end of every session (`/status`). Newest information wins._

## Current unit
- None. 0.4 Claude config merged (PR #4); next is 0.5 via /next.

## Now
- **Phase 0 — Claude Code setup + baseline.**
  - Units 0.1–0.3 merged (PRs #1–#3, squash). `dev/ligo` runs the stack: docker mode on your
    machine (ADR 0010), native mode in cloud sessions. Baseline verified on your Linux box.
  - Unit 0.4 (Claude config): merged (PR #4). Root and nested CLAUDE.md files, 8 path rules,
    `.claude/settings.json` (permissions + hooks), 8 hooks with 45 bats tests, 8 agents,
    16 skills, `.mcp.json` (Playwright, read-only Mongo, context7), a local plugin marketplace
    with a Metals LSP plugin. See `logs/tooling.md`.
  - Working agreement: Claude now squash-merges its own PRs once the checks pass (ADR 0011).

## Next
- 0.5 environments (KataGo moves here) · 0.6 CI (incl. the hook tests in `meta.yml`) · 0.7 dry run.

## Waiting on owner
- Confirm the choices the spec left open in unit 0.4 (listed in PR #4).
- Paste `dev/cloud-setup.sh` into the cloud environment's Setup script (Project settings). It now
  also installs bats and shellcheck.
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
| 0. Claude setup + baseline | in progress (0.1–0.4 merged) |
| 1–9 | not started |
