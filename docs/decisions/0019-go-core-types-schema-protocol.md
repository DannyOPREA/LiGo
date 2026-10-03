# 0019. Go core types, game storage and round protocol; scalachess stays as a library
- Status: Accepted
- Date: 2026-09-28
- Decided by: Claude, under the owner's 2026-09-28 delegation ("Don't ask for my approval for
  anything, just work until I tell you to stop"). Unit 3.9 (PLAN §5). The owner can revisit it with a
  superseding ADR.

## Context
Phase 3 turns lila's chess games into Go games (PLAN §3.4 steps 3–6, units 3.10–3.17). Unit 3.9
fixes the shape of that change before any code moves. A read-only survey of the kept modules
(ADR 0018) and `lila/app` found:

- lila uses about 20 **game-neutral** scalachess types: `Color` (109 files), `Status` (52),
  `ByColor` (51), `Clock` (48), `IntRating` (42), `Ply` (36), `Rated`, `Speed`, `Centis`,
  `Clock.Config`, `IntRatingDiff`, `PlayerTitle`, `Outcome`, `CorrespondenceClock`, `MoveMetrics`, and
  others. About 245 files touch at least one. `lila/modules/core/src/main/lilaism/Lilaism.scala` does
  `export chess.Color`, so bare `Color` means `chess.Color` everywhere.
- About 200 files use **chess rules and formats**: `variant` (123 files), FEN (69), PGN (57),
  openings (53), UCI (29), `Position`, `Board`, `Square`, `Move`, `chess.Game`, eval.
- `scalachess-rating` 17.17.1 (Glicko-2, ADR 0013) depends on `scalachess_3` 17.17.1. Its classes
  use `chess.ByColor`, `chess.Color`, `chess.Outcome` and `IntRating` from core, and nothing from the
  chess rules.
- A game is one Mongo document in `game5`. `lila.core.game.Game` holds `chess: chess.Game`, from
  which position, ply, clock and turn come. Standard games store Huffman-coded SAN (`hp`); variants
  store binary SAN plus pieces, castling and similar keys. The Fischer clock (`c`), clock history
  (`cw`, `cb`) and move times (`mt`) are game-neutral.
- A move arrives from lila-ws as `r/move <fullId> <uci> …`, is parsed with `Uci`, validated by
  `chess.Game.moveWithCompensated` (which also steps the clock with lag compensation), and goes back
  to clients as versioned `move` events carrying `uci`, `san`, `fen`, `dests`, `clock` and chess flags.
  lila-ws parses `Uci`/`Fen` to relay moves and feed live mini boards (`Fens.scala`), and in its eval
  cache (`evalCache/`, removed by ADR 0018). It also depends on `scalachess-play-json`.
- strategygames (10.2.1-s3-ps14) does not depend on scalachess (its POM), and ships
  `strategygames.ByoyomiClock` (its jar).
- `libs/go-rules` has its own `Color`, `Position` and `Action` (`model.scala`), so a wildcard import
  of `ligo.gorules.*` in lila would shadow lila's global `Color`.

## Decision

### 1. scalachess stays, as a library for neutral types and Glicko-2 only
lila and lila-ws keep depending on scalachess (pinned, as now) for the game-neutral types above and
for Glicko-2. After unit 3.17 **no LiGo code uses scalachess's chess rules or formats**: no
`chess.format`, `chess.variant`, `chess.opening`, `chess.eval`, `Board`, `Position`, `Square`, `Move`
or `chess.Game`. Unit 3.17 adds a CI check that fails if such an import comes back, and drops the
artifacts nothing needs any more (`scalachess-tiebreak`, `scalachess-test-kit`; `scalachess-play-json`
if only its neutral JSON givens were used, which move to lila). This replaces PLAN §3.4 step 5's
"drop scalachess, keeping its Glicko-2 module", which can't be done as written.

Revisit (by a superseding ADR) if a Go need can't be met from outside scalachess's types: a
"scored" game status or a byo-yomi clock in Phase 4 (see 5 and 7), or the provisional-rating
threshold in Phase 5.

### 2. Two colour types, one bridge
lila keeps `chess.Color` everywhere (Go's Black is `chess.Black`, White is `chess.White`). lila code
never wildcard-imports `ligo.gorules.*`; it converts between the two `Color`s, and between lila's
and go-rules' other types, in one place: a bridge object in `core` (`lila.core.game.GoBridge`),
since `core`'s `Game` holds the Go game and every module can reach it. The 3.17 CI check also bans
`strategygames.` imports anywhere outside `libs/go-rules`.

### 3. The game model: a Go game beside the chess one, then instead of it
- Unit 3.11 moves `clock`, `ply` and `startedAtPly` off `chess.Game` onto lila's `Game` (keeping the
  names its `export` gives them today), and adds the Go setup (board size, ruleset, komi, handicap,
  from `ligo.gorules`) and a single `go` perf beside the chess perfs.
- Unit 3.12 adds `go: Option[GoGame]` beside `chess`. A Go game carries an unused standard-start
  chess game, so chess readers keep compiling. Unit 3.17 removes `chess` and makes `go` required.
- `GoGame` (go-rules) is the authority on the position, turn, captures, ko point and phase. go-rules
  gains a public `GoGame.replay(setup, actions): Either[...]` for loading (its private one calls
  `sys.error`, which must not crash a round actor on a corrupt document). Unit 3.12 measures a
  300-move 19×19 replay, since game lists load many games, and cross-checks the replayed ply count
  against the stored `t` (`ac` also holds resumes, so its length is not the ply count).
- **Ply** counts placements and passes. Resuming play from the scoring phase is not a ply. lila
  derives the player to move from ply parity (even is White), so `startedAtPly` is 1 when Black
  moves first (even games, handicap 1) and 0 when White does (handicap 2–9), the trick lila already
  uses for positions with Black to move. A custom starting position (`ip`) takes it from the
  position's player to move. That parity rule only holds when a game is loaded: at runtime lila's
  `turnColor` is today `chess.Game.player`, so unit 3.11 redefines `turnColor` on lila's `Game`
  (from `GoGame.toMove` for Go games). Tests per handicap case (0, 1, 2+) and for a custom position
  check lila's turn equals `GoGame.toMove`. Upstream spots that assume White moved first
  (`GameUi.scala` "didn't move" message, `RoundUi.scala` move count) are fixed as their units reach
  them.

### 4. Storage: same collection, neutral keys kept, a small Go block
Go games stay in `game5` and keep every game-neutral key (ids, players, status, ply, `st`, clock,
clock history, move times, dates, rated flag, winner, source, bookmarks). They never write the chess
keys (`hp`, `pg`, `ps`, `ph`, `cl`, `ur`, `cc`, `chd`, `if`, `v`, `pgni`, `do`). New keys:

| Key | Holds |
|---|---|
| `sz` | board size: 9, 13 or 19 |
| `ru` | ruleset: `j` Japanese, `c` Chinese |
| `km` | komi × 2, as an integer (komi is a multiple of 0.5) |
| `hc` | handicap 0–9; omitted when 0 |
| `ip` | a custom starting position (later: analysis, puzzles); omitted otherwise |
| `ac` | the actions, 2 bytes each, big-endian: a point is `row × size + col`, pass is `0xFFFF`, resume is `0xFFFE` |

A 300-move game's actions take 600 bytes. Captures, phase and ko point are derived by replaying
`ac`; lists that need prisoner counts without a replay may add a denormalised field later. `ip`
holds the stones as two SGF point lists (`AB`/`AW` style) and the player to move; its exact BSON
shape is 3.12's.

From 3.12 to 3.17 the reader, the writer and `GameDiff` branch on the Go block: a Go document has no
`hp`/`ps`/`cl`, which the chess reader requires today, and `GameDiff` writes `ac` instead of the chess
keys. A BSON round-trip test covers Go games.

Chess games already in a developer's database are not migrated (LiGo has no production data).
From 3.17 game queries only match documents with `sz`, so old chess documents are ignored rather
than read. Claude never drops or wipes a database: resetting the owner's local data is the owner's
call, and the 3.17 PR gives the command for it.

### 5. Clocks
Fischer games keep scalachess's `chess.Clock` unchanged (limit, increment, berserk, moretime, lag
compensation, the `c`/`cw`/`cb` storage). A Go move steps the clock itself, since
`chess.Game.moveWithCompensated` no longer does it, repeating scalachess's `Game.applyClock`
recipe: apply the frame lag (`withFrameLag`), `step(metrics, gameActive)`, and `start` the clock
after the first ply. `Clock(config)` starts with White's side, so a Black-first game switches it
to Black at creation; a test checks the right side's clock runs in a Black-first game. Byo-yomi arrives in Phase 4 behind a small
lila-side clock interface with two implementations: Fischer (`chess.Clock`) and byo-yomi
(strategygames' byo-yomi clock, wrapped by `libs/go-rules` per ADR 0012), stored under its own key
rather than inside `c`. Correspondence keeps lila's days-per-move clock.

### 6. Round protocol (lila ⇄ lila-ws ⇄ browser)
- Browser → lila-ws: the round `move` message carries `"u": "pd"` (an SGF point, `[a-s]{2}`) or
  `"u": "pass"`. Resume and the scoring-phase messages come in Phase 4 (PLAN §3.5).
- lila-ws → lila: `r/move <fullId> <move> <blur> <lag> …`, `<move>` as above. lila-ws checks the
  token's shape only; it never needs Go rules.
- lila validates with `libs/go-rules` (`play` or `pass`). A refusal becomes the usual client error,
  with the fixture reason (`occupied`, `suicide`, `superko`, …) as its text.
- lila → clients, a versioned `move` event:
  `{"p":"pd"}` or `{"pass":true}`, plus `"ply"`, `"cap"` (points captured by this move),
  `"prisoners":{"b":n,"w":n}` (`b` is the White stones Black has taken, as go-rules' `Captures`), `"ko"` (optional), `"phase"`, `"clock"` (optional), and `"status"`
  / `"winner"` when the game ends. No `dests`: the browser's goban engine knows the legal points and
  the server re-checks.
- The move bus event becomes `(gameId, board, move)` instead of FEN and UCI.
- Live mini boards: the move event also carries `"board"`, a compact string (rows top to bottom
  separated by `/`, `b` and `w` for stones, a number for a run of empty points), which lila-ws's
  `Fens` relays as `{"id","lm","board","turn","wc","bc"}`.
- Takebacks (casual games) use `GoGame.undo`, with the clock restored from clock history as today.
  Draw offers are removed; Go games end by resignation, timeout or abort in Phase 3 (and by
  scoring in Phase 4).

### 7. Game status and how Phase 3 games end
Phase 3 needs only statuses lila already has (started, resign, out of time, aborted, no start,
unknown finish).
- **Two passes in Phase 3.** The scoring phase and resuming play arrive in Phase 4, so in Phase 3
  the second consecutive pass ends the game with status "unknown finish" and no winner, stopping the
  clock. Nobody loses on time for having passed, and no game hangs. Phase 3 games are casual only
  (ratings come in Phase 5), so no rating is affected. Phase 4 replaces this with the scoring phase.
- **Move cap.** lila's chess cap (`Game.maxPlies = 600`) forces a draw, which Go doesn't have
  (R-END-5). Go games get their own cap of 1,000 plies (well beyond any real 19×19 game; superko
  already prevents endless repetition), ending the same way as two passes: "unknown finish", no
  winner. Phase 4 revisits it (reaching the cap could open the scoring phase instead).
- **"Scored"** (both players accepted a count) is decided in Phase 4. scalachess's `Status` has
  `VariantEnd` and `UnknownFinish`, which may be enough; if not, that is the trigger in decision 1
  to vendor the neutral types.

### 8. Order of work
As PLAN §5's Phase 3 table, with lila-ws (3.14) after game creation (3.15):
3.10 go-rules in lila's build → 3.11 core types → 3.12 `game` + storage → 3.13 `round` →
3.15 game creation (from here no chess games are created) → 3.14 lila-ws → 3.16 everything else →
3.17 chess rules and formats removed, CI check added. `core` depends on `libs/go-rules` from 3.11.
(Amended in unit 3.17, part 1: 3.17 is split in three PRs. Part 1 makes `Game.go` required and
removes the chess game, chess storage and chess moves; stored chess games are not read (lookups by
id and per user add `sz` exists). Server-side forecasts go here rather than in 7.6, with the chess
captcha, GIF export, PGN import (a placeholder until 7.5) and the analysis replay page. Part 2
removes FEN, PGN, UCI, variants and openings from the remaining signatures; part 3 adds the CI check
and drops the scalachess pieces. logs/decisions.md, 3.17 row.)
(Amended in unit 3.16: the API move stream now streams Go games too, `{board, turn, lm, wc, bc}` per
position; the bus `MoveGameEvent` carries strings (the FEN or compact board, the last move).
logs/decisions.md, 3.16 row.)
(Amended in unit 3.19, part 1: 3.19 is split. Part 1 puts board size (buttons), rules (a list)
and komi (a number, reset to the ruleset's standard komi when the rules change) in the lobby's
create-game and challenge forms, drops the chess variant picker and FEN input, hides the
casual/rated choice until 5.7, shows the `go` rating, and shows each lobby game's and seek's size,
rules and komi in the lists. The mini-board switch goes with 3.16's thread; chessground and the
chess UI packages go in part 2, after 3.17. logs/decisions.md, 3.19 row.)
(Amended in unit 3.15: hooks, seeks, challenges and bulk pairings carry go-rules' `Setup` (size,
ruleset, komi; handicap 0 until 4.9), stored in `seek`, `challenge` and `challenge_bulk` as an
optional `go` sub-document with the game's own keys (`sz`, `ru`, `km`, `hc`); a record without one
is read as 19×19, Japanese, 6.5 komi. Forms and the API take `size`, `ruleset` and `komi` (standard
komi when omitted), create casual games only until 5.7, refuse chess variants and FENs, and rate in
the `go` perf; pools create 19×19 Japanese casual games until 6.4. logs/decisions.md, 3.15 row.)
(Amended in unit 3.14: 3.14 merges before 3.15, so for a while chess moves are no longer relayed and
no Go games are created yet; lila-ws's lobby needed no change. The mini-board message keeps the
name `fen`, its payload `{id, lm, board, turn, wc, bc}` with `turn` a colour name. logs/decisions.md,
3.14 row.)
(Amended in unit 3.13: the bus `MoveEvent` carries plain strings (board, move) for chess and Go alike
until 3.17; the API move stream stays chess-only until 3.16. logs/decisions.md, 3.13 row.)
(Amended in unit 3.12: `ip` is `{b, w, m}`, the stones as strings of SGF points and the player to
move; a document whose actions stop being legal loads up to the last legal one, and the replayed ply
wins over a stored `t` that disagrees. logs/decisions.md, 3.12 row.)
(Amended in unit 3.11: the Go setup stays go-rules' `Setup` with no lila-side copy until 3.12 stores
it with the game; 3.11 moves `ply`, `startedAtPly` and `clock`, adds `GoBridge` and the `go` perf.
logs/decisions.md, 3.11 row.)
(Amended in unit 3.10: `core` takes the dependency in 3.10 already, with a smoke test; 3.11 is the
first unit whose code uses it. logs/decisions.md, 3.10 row.)

## Consequences
- No new code to own for colours, clocks, time units or Glicko-2; lila-ws keeps its types.
- A chess library stays on the classpath, and names like `Status.Mate` remain visible to lila code
  even though Go never uses them. The CI check from 3.17 keeps chess rules from creeping back.
- Between 3.12 and 3.17 every Go code path must check that `go` is set; a BSON round-trip test for
  Go games guards it.
- COPYING.md keeps scalachess's MIT notice.
- Phase 4 may still switch to vendoring (option B below) if `Status` or the clock need Go values.

## Alternatives considered
- **B: vendor the neutral types and Glicko-2 (MIT, roughly 2k lines) into lila and drop
  scalachess.** It gives full control (a "scored" status, byo-yomi inside the clock, an editable
  provisional threshold), but we'd own that code without upstream fixes, and it can only happen after
  3.17 anyway. Kept as the fallback named in decision 1.
- **C: a shim package re-exporting scalachess's types.** It makes a later switch to B touch one file,
  but costs about 255 import rewrites now, in units that are already large.
- **Size-dependent one-byte action encoding.** 19×19 has 361 points, so one byte can't hold every
  point; two bytes for every size is simpler.
- **SGF text for actions.** The same size and readable in the Mongo shell, but SGF has no token for
  resuming play, and the binary form matches lila's other stored fields.
- **Moving Fischer onto strategygames' clock too.** One clock implementation, but it would throw
  away lila's proven lag compensation for no gain in Phase 3.
