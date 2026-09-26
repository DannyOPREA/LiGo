# 0002. Reuse before build
- Status: Accepted
- Date: 2026-09-26
- Decided by: owner (own initiative)

## Context
The owner strongly prefers pre-built software over custom software and wants every Claude agent to
follow the same principle.

## Decision
For any capability, stop at the first rung of this ladder that works:
1. Use existing software as-is (a dependency, a service, or an existing lila feature).
2. Configure or extend it through its supported extension points.
3. Wrap it with a thin adapter.
4. Vendor or fork it minimally, recording where it came from.
5. Port it, when the logic exists in another language and there's no way to call it.
6. Build custom: glue only, or when nothing suitable exists.

Anything beyond small glue needs a build-vs-buy memo (`docs/build-vs-buy/`, produced by the
`reuse-scout` agent) and the owner's approval. Adding, removing or swapping a dependency is a major
decision. Only AGPL-3.0-compatible licences are acceptable.

## Consequences
- The planned architecture leans on lila, strategygames, OGS goban, KataGo, goscorer and lila-docker.
- Each of those is still confirmed by a Phase 1 spike and memo before integration.
- Upstream fixes to reused components are preferred over local patches.

## Alternatives considered
Building a bespoke board component and TypeScript rules library (the first draft of the plan).
Rejected: it reinvents OGS's goban.
