---
name: core-type-migration-review-patterns
description: Reviewing units that move fields between lila's Game and nested chess.Game, or add a perf key (3.11) — stale-copy greps, tautological sync tests, opaque-key matches
metadata:
  type: feedback
---

Patterns from unit 3.11 (lila Game took ply/startedAtPly/clock off chess.Game; new `go` perf).

- Stale copies: grep `\.chess\b`, `_\.chess\b`, `copy(chess`, `withChess(`, `Fen.write(` and every
  `chess.Game(`/`ChessGame(` construction; the compiler can't see `copy` staleness.
- Sync tests are often tautological (`chessState.ply == ply` when chessState copies ply). Ask for
  checks on the *stored* copy (`g.chess.ply == g.ply` after withChess) and on values that a stale
  copy would lose (remaining time after giveTime), not on config.
- PerfKey is an opaque String: `match` on `PerfKey.x` vals is never exhaustiveness-checked. A new key
  needs a grep of `case PerfKey.` (History.apply had no `go` case -> latent MatchError) and of
  `PerfType.nonPuzzle`/`perfsList` consumers (user download toggles, lobby ratingMap show it at once).
- Turn parity (`ply.turn`) vs FEN colour: every lila builder goes through
  `Position.AndFullMoveNumber.ply`, which keeps parity; check any new builder that sets ply by hand.
- Units deviating from their ADR/PLAN row (3.11 deferred the Go setup to 3.12) record it in
  decisions.md; also ask for an ADR amendment line, as 3.10 did.

**Why:** 3.11 review found no stale path but these were the places worth checking.
**How to apply:** 3.12–3.17 (game model, round, chess removal) and any new perf.
