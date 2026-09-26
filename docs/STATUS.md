# Status

_Updated at the end of every session (`/status`). Newest information wins._

## Now
- **Phase 0 — Claude Code setup + baseline.** Unit 0.1 (repo bootstrap) is done; PR open against `main`, waiting for
  the owner's review.

- Unit 0.2 (approved): lila + lila-ws imported at pinned SHAs (squashed). **Build blocked** by the
  cloud network policy; see "Waiting on owner". Work is on branch `claude/unit-0.2-import-upstream`.

## Next
- Finish unit 0.2 once the hosts are allowed: pnpm install, UI build, sbt compile, run, screenshot.
- Then 0.3 dev tooling · 0.4 Claude config · 0.5 environments · 0.6 CI · 0.7 dry run.

## Waiting on owner
- Owner actions in GitHub settings: (1) make the repo public, (2) set the default branch to `main`,
  (3) protect `main` (require a PR, require status checks once CI exists, block force-pushes).
- Review and merge the unit 0.1 PR.
- Add to the cloud environment's allowed domains: `jitpack.io`, `repo.scala-sbt.org`,
  `central.sonatype.com`, `codeload.github.com` (all needed to build lila).

## Blockers
- Unit 0.2 build: network allowlist (above).

## Phase progress
| Phase | State |
|---|---|
| 0. Claude setup + baseline | in progress (0.1 done) |
| 1–9 | not started |
