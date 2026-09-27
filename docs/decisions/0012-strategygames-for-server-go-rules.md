# 0012. strategygames as a dependency for the server-side Go rules and byo-yomi clock
- Status: Accepted
- Date: 2026-09-27
- Decided by: owner (on Claude's recommendation)

## Context
lila needs Go rules (legality, captures, ko/superko, handicap placement, passing into scoring) and a
byo-yomi clock on the server, in Scala (PLAN §3.1, §3.4). Unit 1.1 spiked PlayStrategy's
`strategygames` (MIT), whose Go package was rewritten in pure Scala in Aug–Sep 2026. The spike and
the options are in [the build-vs-buy memo](../build-vs-buy/server-go-rules.md): it runs on lila's
Scala 3.8.4 next to scalachess, its 413 Go tests pass, it implements situational superko (ADR 0003),
and its `ByoyomiClock` works. It ships ~10 games in one artifact, but the Go package and the clock
load none of the others, so their jars can be excluded.

## Decision
Use `org.playstrategy::strategygames` as a dependency (option A), not a vendored copy (option B):
- Pin an exact version (`10.2.1-s3-ps14` at the time of the spike) and add PlayStrategy's Maven repo
  (`https://raw.githubusercontent.com/Mind-Sports-Games/lila-maven/master`) to lila's build, to
  `dev/cloud-setup.sh`'s sbt repositories list (ADR 0008) and to whatever CI resolves.
- Exclude `org.playstrategy:fairystockfish`, `com.joansala.aalina` and `com.joansala`.
- Use only `strategygames.go` and the shared types/clock it needs, behind the `libs/go-rules`
  adapter; lila code never imports strategygames directly.
- Record the jar's SHA-256 in `docs/UPSTREAM.md` and its MIT notice in `COPYING.md` when the
  dependency lands.
- scalashogi's clock (the plan's fallback) is not needed.

The dependency itself is added by the adapter unit (1.7), which goes through the usual manifest
permission prompt.

## Consequences
- Least code owned; upstream fixes arrive by bumping one version, which may also carry changes to
  strategygames' shared code for other games.
- A third-party, unsigned Maven repo becomes a build dependency; pinning and the recorded SHA-256
  bound the risk.
- A shared code path that touches an excluded game would fail at runtime, not compile time; the
  adapter's tests and the conformance fixtures (units 1.6–1.7) cover the paths we use.
- If upstream breaks the Go API often, stops publishing, or pulls in something we can't exclude,
  switch to option B (vendor the Go package); the adapter boundary keeps lila out of that change.

## Alternatives considered
Vendor the Go package (B, runner-up), build our own (C), call an out-of-process engine (D). See the
memo.
