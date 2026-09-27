# 0011. Claude merges its own PRs
- Status: Accepted
- Date: 2026-09-27
- Decided by: owner (own initiative)

## Context
The working agreement (PLAN §1.1 and §7, CLAUDE.md, CLAUDE_SETUP §1) said Claude opens PRs and the
owner merges them, enforced by deny rules on `gh pr merge` and the GitHub MCP merge tools plus a
guard hook. With < 5 h a week, finished units waited on the owner just to press the merge button.
On 2026-09-27 the owner asked to "change the working agreement to allow you to merge without my
approval".

## Decision
Claude squash-merges its own unit PRs, without waiting for the owner, once all of these hold:
- /verify passed on the PR's head, and CI is green once it exists (unit 0.6);
- the `reviewer` agent has no open blocking finding;
- no review thread on the PR is open;
- no question to the owner is pending on the unit.

Then it tells the owner the PR merged. Everything else in the working agreement stays: units
still need the owner's approval before they start, major decisions still go to the owner, and
Claude still never pushes to `main`, force-pushes or bypasses branch protection.

Enforcement: `gh pr merge` and `mcp__github__merge_pull_request` move from `deny` to `allow` in
`.claude/settings.json`. guard-bash lets a PR merge through only as a squash-merge, and blocks
`--admin` (bypasses protection) and `--auto` (merges before Claude has checked the PR); the MCP
merge tool must pass `merge_method: "squash"`. The MCP auto-merge tool stays denied.

## Consequences
- The owner reviews after the fact: a bad merge is undone with a revert PR, not a force push.
- `main`'s branch protection must not require an approving review. GitHub doesn't let a PR's
  author approve their own PR, and Claude's PRs are opened under the owner's account, so a
  required approval would block every merge. "Require a pull request" and, after unit 0.6,
  "require status checks" are fine.
- Until CI exists (unit 0.6), /verify and the reviewer are the only gates before a merge.

## Alternatives considered
Keep owner-only merging; let Claude merge only docs/tooling PRs; let Claude enable GitHub
auto-merge (rejected for now: with no required status checks yet it would merge at once).
