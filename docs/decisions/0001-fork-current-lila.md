# 0001. Fork current upstream lila
- Status: Accepted
- Date: 2026-09-26
- Decided by: owner, on Claude's recommendation

## Context
LiGo adapts the lichess interface to Go. There are three candidate bases: current upstream lila
(Scala 3.8, sbt 2, Pekko, liplay), lishogi (a hard fork frozen on Scala 2.13 / Akka / Play 2.9), and
PlayStrategy's lila fork (supports Go, but based on 2021 lila with Akka / Play 2.8, about 20 other
games behind generic abstractions, and a chess board bent into a Go board).

## Decision
Hard-fork current upstream `lichess-org/lila` and `lichess-org/lila-ws` at SHAs taken after the
June 2026 sbt 2 / liplay migration, recorded in `docs/UPSTREAM.md`. Reuse PlayStrategy's MIT Go
rules library rather than its lila fork. Review upstream monthly and cherry-pick selectively.

## Consequences
- Modern stack; lila's own docs and code are the reference for Claude and humans.
- More up-front work to add Go than starting from PlayStrategy.
- Like every hard fork, we will drift from upstream; the monthly upstream-scout review limits the
  cost, and security fixes are ported first.

## Alternatives considered
- Fork PlayStrategy: fastest demo, but inherits old infrastructure and multi-game overhead.
- Fork lishogi: stack frozen on Scala 2.
- Stay mergeable with upstream: unsustainable once chess assumptions are removed.
