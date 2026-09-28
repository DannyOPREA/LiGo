# Architecture Decision Records

Every major decision (see [PLAN §7](../PLAN.md#7-working-agreement)) is recorded here once the owner
approves it. ADRs are numbered and **immutable once Accepted and merged to `main`**: to change one,
write a new ADR that supersedes it and set the old one's status to `Superseded by NNNN` (the only
edit allowed). While the PR that introduces an ADR is still open, its wording may be corrected.

| # | Title | Status | Date |
|---|---|---|---|
| 0001 | [Fork current upstream lila](0001-fork-current-lila.md) | Accepted | 2026-09-26 |
| 0002 | [Reuse before build](0002-reuse-first.md) | Accepted | 2026-09-26 |
| 0003 | [Situational superko in both rulesets](0003-superko-in-both-rulesets.md) | Accepted | 2026-09-26 |
| 0004 | [OGS rank curve for kyu/dan display](0004-ogs-rank-curve.md) | Accepted | 2026-09-26 |
| 0005 | [Initial lobby presets](0005-initial-lobby-presets.md) | Accepted | 2026-09-26 |
| 0006 | [MIT for LiGo's own code](0006-mit-for-own-code.md) | Superseded by 0007 | 2026-09-26 |
| 0007 | [Licensing corrections after the upstream import](0007-licensing-corrections-after-import.md) | Accepted | 2026-09-26 |
| 0008 | [Dependency sources in cloud sessions](0008-cloud-dependency-sources.md) | Accepted | 2026-09-26 |
| 0009 | [Remove upstream Git LFS attributes](0009-remove-lfs-attributes.md) | Accepted | 2026-09-26 |
| 0010 | [Dev tooling on a trimmed copy of lila-docker](0010-dev-tooling-on-lila-docker.md) | Accepted | 2026-09-26 |
| 0011 | [Claude merges its own PRs](0011-claude-merges-its-own-prs.md) | Accepted | 2026-09-27 |
| 0012 | [strategygames as a dependency for the server-side Go rules](0012-strategygames-for-server-go-rules.md) | Accepted | 2026-09-27 |
| 0013 | [lila's Glicko-2 with OGS's settings, rank curve and handicap maths](0013-lila-glicko2-with-ogs-settings.md) | Accepted | 2026-09-28 |

## Template

```markdown
# NNNN. Title
- Status: Proposed | Accepted | Superseded by NNNN
- Date: YYYY-MM-DD
- Decided by: owner (on Claude's recommendation | own initiative)

## Context
## Decision
## Consequences
## Alternatives considered
```
