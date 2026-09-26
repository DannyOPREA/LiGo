# Status

_Updated at the end of every session (`/status`). Newest information wins._

## Now
- **Phase 0 — Claude Code setup + baseline.**
  - Unit 0.1 (repo bootstrap): merged (PR #1).
  - Unit 0.2 (import + baseline): merged (PR #2, squash).
  - Unit 0.3 (dev tooling): PR open for review. `dev/ligo` runs the stack in one command:
    docker mode on your machine (a trimmed copy of lila-docker, ADR 0010), native mode in cloud
    sessions. `dev/cloud-setup.sh` codifies ADR 0008. The baseline runs on your Linux box in
    docker mode (owner-verified 2026-09-26). See `logs/tooling.md`.

## Next
- Unit 0.4 Claude config: CLAUDE.md files (which also neutralise `lila/AGENTS.md`), rules,
  settings, hooks (including a SessionStart hook that runs `dev/ligo deps`), agents, skills.
- Then 0.5 environments (KataGo moves here) · 0.6 CI · 0.7 dry run.

## Waiting on owner
- Review the unit 0.3 PR.
- Paste `dev/cloud-setup.sh` into the cloud environment's Setup script (Project settings).
- GitHub: add "Require a pull request before merging" to the `main` ruleset (it currently blocks
  only deletion and force-push). Status checks come after CI (unit 0.6).

## Blockers
- None.

## Known caveats
- Until unit 0.4, `lila/AGENTS.md` (lichess's contributor guide) auto-loads for any Claude session
  reading `lila/`. It says "trust these instructions" and suggests non-frozen `pnpm install`,
  `sbt clean` and `bin/deploy`. LiGo's rules win on any conflict: frozen lockfile, never
  `bin/deploy`, ask when unsure.
- Upstream non-free/NC assets remain in the tree until the first Phase 3 unit (COPYING.md §1.1).

## Phase progress
| Phase | State |
|---|---|
| 0. Claude setup + baseline | in progress (0.1, 0.2 merged; 0.3 in review) |
| 1–9 | not started |
