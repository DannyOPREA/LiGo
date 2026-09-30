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

- 3.12 (Go BSON block): the PLAN row's "game lists and exports" was quietly deferred in the log's
  Follow-ups only. Grep `Fen.write\|Fen.writeBoard\|lastMoveKeys` in the module (UserGameApi,
  JsonView.ownerPreview, PgnDump) and compare with the PLAN row; a deferral needs a decisions.md line.
- Tests like `turnColor == GoBridge.color(go.toMove)` are tautological when turnColor is defined that
  way; the real invariant is ply parity (`ply.turn == toMove`) and stored `st` vs setup's first mover.

- 3.13 (round plays Go): turning a chess predicate off for Go (`forceDrawable = !isGo && …`) also
  kills its *other* readers: JsonView/RoundMobile use `forceDrawable` to gate `isGone` (claim victory).
  Grep every consumer of a predicate before gating it. Chess-only paths that "work" for Go only via
  the dummy start position (`position.opponentHasInsufficientMaterial` in Finisher.outOfTime /
  ResignForce) deserve a guard or comment. scalachess `applyClock` starts on `ply - startedAtPly == 1`
  (javap-verified 17.17.1) and passes `gameActive = status.isEmpty`. End-of-game logic living inside
  the actor (MovePlayer) had no test; ask for a pure predicate. Chess-only consumers of empty `sans`
  for Go: PushApi.move (corres push), FarmBoostDetection, takeback message numbering.

**Why:** 3.11 review found no stale path but these were the places worth checking.
**How to apply:** 3.12–3.17 (game model, round, chess removal) and any new perf.
