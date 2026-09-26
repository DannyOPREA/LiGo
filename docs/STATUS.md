# Status

_Updated at the end of every session (`/status`). Newest information wins._

## Now
- **Phase 0 — Claude Code setup + baseline.**
  - Unit 0.1 (repo bootstrap): merged (PR #1).
  - Unit 0.2 (import + baseline): done on branch `claude/unit-0.2-import-upstream`, PR open for
    review. The unmodified lichess builds and runs in a cloud session (see
    `logs/upstream-fork.md`).

## Next
- Unit 0.3 (needs your approval): `dev/` tooling on lila-docker, the `ligo` CLI, doctor, and the
  cloud setup script codifying ADR 0008. It ends with you running the baseline on your Linux box.
  Consider running unit 0.4 (CLAUDE.md files) first or alongside it: until it lands, Claude Code
  auto-loads lichess's `lila/AGENTS.md`, which doesn't govern LiGo.
- Then 0.4 Claude config · 0.5 environments · 0.6 CI · 0.7 dry run.

## Waiting on owner
- Review the unit 0.2 PR: skim COPYING.md §1.1 (licensing is a judgement call) and ADRs 0007–0009.
- **Choose the merge method** for it. *Squash* (recommended) keeps `main` free of the earlier branch
  commits, which still carry the LFS attributes, and UPSTREAM.md still records the upstream SHAs and
  tree ids. A *merge commit* keeps the separate import commit, but checking out those older commits
  then needs `GIT_LFS_SKIP_SMUDGE=1` wherever git-lfs is installed.
- GitHub: add "Require a pull request before merging" to the `main` ruleset (it currently blocks
  only deletion and force-push). Status checks come after CI (unit 0.6).
- Approve the next unit.

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
| 0. Claude setup + baseline | in progress (0.1 merged, 0.2 in review) |
| 1–9 | not started |
