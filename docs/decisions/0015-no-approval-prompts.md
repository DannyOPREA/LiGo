# 0015. No approval prompts in the repo's Claude settings
- Status: Accepted
- Date: 2026-09-28
- Decided by: owner (own initiative)

## Context
Unit 0.4 put an `ask` list in `.claude/settings.json`, so edits to dependency manifests and
lockfiles, package installs, the rules spec, the conformance fixtures, CI workflows, licence
files, `.claude/settings.json` and the hooks, plus `docker system prune`, `docker volume rm` and
`sbt clean`, always prompted the owner, even in `auto` mode (CLAUDE_SETUP §5). With < 5 h a week,
those prompts stalled units until the owner opened the thread. On 2026-09-28 the owner wrote:
"Don't ask for my approval for anything, just work until I tell you to stop."

## Decision
Remove the whole `ask` list from `.claude/settings.json`. The owner made this edit himself
(PR #16), because the cloud session's auto-mode safety check refuses to let Claude loosen its own
permission settings, even with the owner's go-ahead.

Kept, because they are not approval requests to the owner:
- the `deny` rules (no force-push, no push to `main`, no `reset --hard origin/main`, no MCP
  auto-merge, no reading `.env` or secrets);
- `guard-bash.sh` (squash-only merges, no `--admin` or `--auto`, no non-frozen `pnpm install`,
  no cloud `sbt clean`, no `bin/deploy`) and `guard-paths.sh`;
- the stop gate (`verify.sh` plus a logs/ entry) and CI, including `main`'s required checks.

## Consequences
- The files above no longer prompt. Claude still records dependency changes in `COPYING.md` and
  the rules spec and fixtures still change only through the `go-rules-expert` agent.
- Prompts can still come from the cloud session itself (its permission mode and auto-mode safety
  check, e.g. on edits to Claude's own settings). Those are not controlled by this repo.
- CLAUDE_SETUP §5 and `.claude/rules/dependencies.md` no longer describe the prompt as the
  owner's approval moment.

## Alternatives considered
Keep the prompts; keep them only for `.claude/settings.json` and hooks (rejected by the owner's
"anything").
