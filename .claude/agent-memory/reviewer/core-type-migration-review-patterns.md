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

- 3.14 (lila-ws Go wire): check PLAN row's Needs column and ADR 0019 §8 order (3.15 before 3.14);
  running a unit ahead of its listed dependency is "changing order" (PLAN §7) and needs a decisions
  line. `dev/ligo test ws`/verify report Total 0 when sbt 2 caches: rerun with `sbt --batch testFull`
  in lila-ws. Wire payload renames: grep lila/ui consumers (`socket.in.fen` in boot.ts/pubsub.ts).

- 3.16 (other modules on Go): anything that walks `go.actions` by index and maps it to ply or clock
  index breaks after a `Resume` (an action, not a ply, toMove unchanged). Ask for per-state `toMove`.
  Sending `steps: []` to the round UI crashes it (`util.firstPly` reads `steps[0]`) until 3.18.
  PGN export/pgnInJson still emit chess PGN for Go. Check `git fetch` + merge-tree: main moved (3.15)
  mid-review. Another session shared the worktree and ran verify concurrently -> bogus compile
  failure; rerun alone. `pgrep -f verify.sh` in an until-loop matches its own bash line.
  Unit-scoped rerun: `cd lila && ./lila.sh --batch "game/testFull"` (one project per call).

- 3.17 part 1 (chess storage gone, `Query.go` = `sz` exists): the reader now throws on a chess doc,
  so EVERY Game-reading selector needs the guard, not just `Query.user`/by-id. Missed ones:
  `Query.nowPlaying`/`nowPlayingVs`/`opponents`/`imported` (GameFilter profile tabs, urgentGames on
  login/home, `allPlaying` in account closure, API exports), `byIdsCursor`, `cursor(inIds)`,
  `exportByIds`, `lastGameBetween`. Grep `cursor[Game]`, `list[Game]`, `one[Game]`, `Query.` users in
  app/mashup and PaginatorBuilder. Also check for code copied from an open sibling PR (3.17 pulled
  #88's `GoBridge.miniState` + GameUi go-mini markup without its TS): merge-tree against that branch.

- 3.17 part 2a (PGN/FEN/UCI gone): server code was clean; the misses were user-facing text that
  still promised the removed format: UserGamesDownload ("download imported games as PGN", include
  toggles `opening`/`literate`/"PGN tags" now ignored), mod games "Download PGN" button, browser
  download filenames `.json` for NDJSON. Also dead TS/CSS left behind (site.lpvEmbed, bits.lpv,
  pgn-viewer dep) and dead prefs (autoThreefold radio). Grep views + ui for the format name.

**Why:** 3.11 review found no stale path but these were the places worth checking.
**How to apply:** 3.12–3.17 (game model, round, chess removal) and any new perf.
