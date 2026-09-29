# 0023. Phase 7: the analysis board, SGF import and export, correspondence
- Status: Accepted
- Date: 2026-09-29
- Decided by: Claude, under the owner's 2026-09-28 delegation ("Don't ask for my approval for
  anything, just work until I tell you to stop")

## Context
Phase 7 (docs/PLAN.md §5, units 7.1–7.8) adds the analysis board with variations, SGF import and
export, and correspondence games (PLAN §1.3, §3.8 items 3–5). The pieces it builds on are settled:
the browser reads SGF and plays Go through goban-engine, wrapped by `libs/board`
([ADR 0014](0014-ogs-goban-for-client-rules-and-board.md)); the stored Go game and lila's
days-per-move clock are [ADR 0019](0019-go-core-types-schema-protocol.md); the scoring phase's
1-day correspondence timeout is [ADR 0020](0020-scoring-phase-protocol-and-byoyomi-shape.md) §6;
the two correspondence lobby tiles are [ADR 0022](0022-phase-6-lobby-pools-handicap-challenges.md)
§1; ADR 0018 keeps `analyse`, `tree`, `notify`, `push` and `ui/analyse` (minus its study, practice,
explorer and engine parts). Decided here: how lila's analysis board becomes a Go board, where SGF is
read and what an imported game is, how the analysis board writes SGF, and which of lila's
correspondence features Go games keep.

What lila has today (read for this ADR; paths under `lila/`):
- `/analysis` (`controllers.UserAnalysis`) serves `ui/analyse`, whose controller (`ctrl.ts`, ~990
  lines) drives chessground and chessops directly and weaves the engine (`ceval`) through ~70
  places. The move tree it edits is `ui/lib/src/tree`: `ops.ts` and `tree.ts` (adding, deleting,
  promoting nodes, paths) are game-neutral, `path.ts` assumes every node id is two characters, and
  `node.ts` fills chess fields (`fen`, `uci`, `san`, `dests`, `check`) through chessops.
  `idbTree.ts` keeps a player's edits in IndexedDB.
- `/paste` and `/api/import` (`controllers.Importer`, `game.Importer`) parse a PGN's main line on
  the server, store it as a finished, non-playable game with `source = import` and the PGN text in
  `pgni` (hashed, so the same file isn't stored twice), and redirect to the game page. Variations and
  comments are dropped on the server; only the browser's PGN paste on `/analysis` keeps them.
- Correspondence: scalachess's `CorrespondenceClock`; setup offers 1, 2, 3, 5, 7, 10 or 14 days per
  move; `Titivate` flags games out of time and abandons a game untouched for 21 days; `CorresAlarm`
  rings at 80% of a player's remaining time when they aren't looking at the game; `notify` has
  `CorresAlarm` and `GameEnd` entries; `push` sends web pushes for moves, game ends, alarms,
  challenges, takeback and draw offers, skipped when the player is watching the game; an opt-in
  daily email (`CorrespondenceEmail`) lists games where it is your turn; forecasts (conditional
  moves) are stored as chess steps (`uci`, `san`, `fen`) in their own collection; "your turn" lists
  come from `GameProxyRepo.urgentGames` (lobby's "now playing", the round's next-game button,
  `/account/now-playing`).

## Decision

### 1. The analysis board is lila's `ui/analyse`, on `libs/board`, with a Go tree node
- **Adapt, don't rebuild.** `ui/analyse` keeps its move list with variations (`treeView`), keyboard
  and button navigation, comments and the path-based tree operations (`ui/lib/src/tree`).
  **lila's tree is the only tree**: SGF is read into it and written from it (§2, §5); goban-engine
  only computes positions and legality. Chessground is replaced by `mountBoard` from `libs/board`, as unit 3.18 does for
  the round page; chessops calls are replaced by `libs/board`'s engine.
- **A Go tree node** keeps lila's generic fields (`id`, `ply`, `children`, `comments`, `glyphs`,
  `shapes`, `clock`, `forceVariation`, `collapsed`) and replaces the chess ones with: `move` (an SGF
  point such as `"pd"`, or `".."` for a pass, goban's own encoding), `color` (who played it), `stones` (the position after the move,
  as two SGF point lists, the same shape as ADR 0019's `ip`), `captures` (prisoners so far, per
  colour) and `ko` (the point that can't be retaken, if any). The id is the move itself, which is
  already two characters, so `path.ts` stays as it is: every child of a node is played by the colour
  to move there, so two children never share an id. Positions are computed by replaying each node
  through `libs/board`'s checked `play()` with LiGo's settings, never taken from the SGF; a node
  that is illegal (a ko retake, an occupied point, a move by the wrong colour, a point off the board)
  is refused with its move number, and the file with it.
- **Board sizes 9×9, 13×13 and 19×19 in the analysis board**, which is not a game: nothing is
  stored and no handicap placement table is used (setup stones are taken as written), so R-SCOPE-1
  (games on 9×9 and 19×19) and ADR 0021 §4 are not widened. Stored imports stay 9×9 and 19×19 (§2).
  An SGF of any other size is refused with a message.
- **What `/analysis` remembers:** as in lila, a position or file loaded on `/analysis` is not
  kept across a reload (`idbTree` in `ui/analyse` saves nothing for its synthetic game); the SGF
  download keeps it.
- **Setup stones only at the root.** A new position can start with black and white stones and
  either player to move (a "setup" mode of the analysis board, with add black / add white / erase
  buttons). This is the Go position editor ADR 0018 left to Phase 7; lila's chess `editor` page is
  not brought back. An SGF with `AB`/`AW`/`AE` after the first move is refused with a message (rare
  in game records; tsumego files are Phase 8's).
- **Removed from `ui/analyse`:** the engine (`ceval`, the eval gauge and arrows), practice,
  retrospect ("learn from your mistakes"), crazyhouse, motif, the opening wiki, the GIF dialog,
  forks, forecasts (§4) and the chess screen-reader view (`nvui`; accessibility is Phase 9). The
  engine hook stays as one empty function the view calls, so a later KataGo review has one place to
  plug in (PLAN §1.3).
- **Glyphs and marks:** SGF's `BM`, `TE`, `DO`, `IT` map to lila's `?`, `!`, `?!`, `!?` glyphs and
  back; `TR`, `SQ`, `CR`, `MA` and `LB` marks and the root comment are kept on the node and written
  back, and marks are drawn on the board only when a later unit wants them (not needed for the demo).

### 2. SGF import: the browser for analysis, the server for stored games
- **Loading an SGF into `/analysis`** (paste or file) happens in the browser, in `libs/board`
  (unit 7.2), with **`@sabaki/sgf`** (MIT, 3.5.0 of 2026-07-07, one MIT dependency, `doken`), the
  fallback ADR 0014 named for SGF, **instead of goban-engine's SGF reader**. goban's reader was
  checked for this ADR and doesn't fit an editable tree: it hangs on a truncated file (a 10-second
  timeout killed `readSgf("(;GM[1]SZ[9];B[ee];W[dd")`), plays moves unchecked, turns an
  off-board point into a pass silently, ignores `BM`/`TE`/`DO`/`IT`, and its `MoveTree.toSGF` writes
  no root properties. `@sabaki/sgf` parses into plain nodes (property → values), which `libs/board`
  turns into lila's tree, replaying each move as §1 says. Files are decoded as UTF-8 unless `CA`
  names another charset the browser's `TextDecoder` knows (Latin-1 for old files); `@sabaki/sgf`'s
  optional charset packages are not installed. Nothing is sent to the server. goban-engine stays for
  positions (unit 1.8's `readSgf` stays for its read-back tests only).
- **`/paste` and `/api/import` store a game**, as lila does with PGN: the server reads the SGF
  (unit 7.3, §3 below), replays the main line through `libs/go-rules`, and stores a finished,
  non-playable Go game (`source = import`) with the SGF text beside it. The game page opens it in
  the analysis board, which reads the stored SGF text, so the variations and comments the server
  ignores still show (unit 7.5).
- **One reading of the root, both sides.** The ruleset, komi, handicap and size rules below are one
  table of cases in `libs/conformance/` (root properties in, the game's settings or a refusal
  out), replayed by both `libs/go-rules`' reader and `libs/board`'s, so a stored import always
  opens in the analysis board. Only the accepted sizes differ (the analysis board adds 13×13).
- **What an imported game stores:** ADR 0019's Go block (`sz`, `ru`, `km`, `hc`, `ip`, `ac`) plus
  an `sgfi` block in place of chess's `pgni`: `{ user, ca, date, sgf, h }`, `h` a hash of the whole
  SGF text as lila hashes the whole PGN (`PgnImport.hash`), so importing the same file twice returns
  the first copy while two files with the same moves but other settings or notes stay apart;
  lila's two `pgni` indexes (`pgni.h`, and `pgni.user` + `pgni.ca`) are renamed to `sgfi`, and the
  uses of `isPgnImport` (Titivate, deleting your own import, the "imported games" download) move
  to it. Players are imported names (lila's
  `Player.makeImported`), with `BR`/`WR` kept as text, never as ratings. The result comes from `RE`
  (`B+R`, `W+3.5`, `B+T`, `0` for jigo, `Void`, anything else as "unknown").
- **What the server accepts:** sizes 9 and 19 (R-SCOPE-1; a 13×13 file is refused with "13×13
  games can be studied on the analysis board but not imported yet"); one game per file (the first
  of a collection); at most 1,000 actions, passes included (ADR 0020's ply cap) and 200 KB of text;
  setup stones only at the root; every move legal under LiGo's rules and by the colour to move (a
  move by the wrong colour is refused, not turned into an edit); nothing after two passes in a row
  (a resumed game can't be imported); komi a multiple of 0.5 after the rule below. Anything else
  is refused with the reason and, for a bad move, its move number.
- **Untrusted input:** the form's field and `/api/import`'s body are capped at 200 KB before any
  parsing (Play's default is 512 KiB); the rate limit runs before the parse, and the file is parsed
  once (lila's form `verifying` parses before the limit and again after); nesting depth is bounded;
  an unknown or invalid `CA` falls back to UTF-8 instead of throwing; the fishnet `analyse` field
  goes with the engines (unit 3.5).
- **Rulesets:** `RU` Japanese, Korean or missing → Japanese; Chinese, AGA, New Zealand, Ing →
  Chinese (area counting); anything else → Japanese, noted in the game's import info. Legality is
  the same either way (ADR 0003), so this only labels the game.
- **Komi:** `KM` as written, except komi given in stones, a convention in files from Chinese
  servers: when the ruleset is Chinese and `KM` is below 5 with a fraction of .25 or .75 (`3.75`,
  `3.25`, `2.75`), it is doubled (7.5, 6.5, 5.5).
- **Handicap:** `HA` + `AB` on the size's fixed handicap points (R-HCP-4; 9×9 and 19×19 only)
  becomes `hc`; any other root stones become a custom start `ip`.

### 3. The server's SGF reader
Per the [build-vs-buy memo](../build-vs-buy/server-sgf-reader.md): **a small FF[4] reader of LiGo's
own in `libs/go-rules`**, beside `Sgf.write` (about 200 lines of Scala, no dependency). strategygames
only writes SGF, the only Scala parser found is an abandoned Scala 2 experiment, and the Java
candidate (`sgf4j`, Apache-2.0) has a six-year-old release, one maintainer and log4j among its
dependencies; calling goban-engine through Node would put a process hop on every import. The reader
only structures the text (nodes, properties, variations, escapes, `CA` charset, lower-case legacy
names, `tt` and `[]` passes); legality stays in `GoGame`. It gets a round-trip test with
`Sgf.write`, a cross-check with goban-engine's reader on an SGF corpus kept in
`libs/conformance/`, the `sgf` skill's quirk cases, and a malformed-input test (no exception,
bounded nesting, the 200 KB limit), since import takes untrusted text. The `sgf` skill's "don't
write a parser" line now names this reader as the one exception.

### 4. Correspondence keeps lila's machinery; forecasts go
- **Days per move:** lila's choices (1, 2, 3, 5, 7, 10, 14) in the setup and challenge forms; the
  lobby's two tiles (1 and 3 days) stay as ADR 0022 set them.
- **Timeouts:** `Titivate` and lila's 21-day abandonment unchanged. The scoring phase in a
  correspondence game has ADR 0020's 1-day timeout, counted from when the proposal arrives.
- **Notifications (in-site, `notify`):** `GameEnd` and `CorresAlarm` kept as they are, plus one new
  entry, **`ScoringPhase(gameId, opponent)`**, sent to both players when a correspondence game's
  scoring phase opens (there is no "your turn" during it and a day is short). `NotifyApi`
  treats it as it treats `CorresAlarm` (the same `shouldSkip` and push-preference branch, and a
  `PushApi` branch). `GameEnd` for a game with no result (`Void`) reads "Your game ended with no
  result" instead of lila's "It's a draw".
- **Alarms (`CorresAlarm`):** rules are lila's (80% of the remaining time, not while you look at
  the game). The second pass is a move, so it would set an alarm on the day clock; instead,
  opening the scoring phase replaces it with one ringing at 80% of the phase's 1-day timeout for
  each player who hasn't accepted, and accepting removes that player's alarm. A resume is not a move
  in lila, so it explicitly sets the alarm again as a move does. The pushed "It's your turn" for the
  second pass is replaced by the scoring-phase push.
- **Web push (`push`):** moves, game ends, alarms, challenges and takeback (undo) requests kept;
  draw offers go (Go games have none, unit 3.13); the scoring-phase notification is also pushed.
  Pushes stay skipped while the player is watching the game.
- **Email:** lila's opt-in daily "your turn" email stays as it is (off by default; a Go game needs
  no change in it). It is a live outward-facing path that Phase 7 does not test or demo; no new
  emails are added.
- **Forecasts (conditional moves) are removed**, server and UI, in units 7.6 and 7.4: they are
  stored as chess moves, the POC scope doesn't list them (PLAN §1.3), and goban-engine's
  `ConditionalMoveTree` (OGS's version) is the place to start if they come back after the POC.
- **"Your turn":** lila's `urgentGames` lists stay the way players find their games: the lobby's
  "now playing" (with Go mini boards from unit 3.19), the round's next-game button and
  `/account/now-playing`. The scoring phase counts as "your turn" for a player who hasn't accepted:
  `Pov.isMyTurn` (which needs a playable game today) and `GameRepo.countWhereUserTurn` (a Mongo
  `$mod` on the ply's parity) both gain a scoring-phase case in unit 7.6, with a test that they
  agree.

### 5. SGF export from the analysis board
- The analysis board downloads the whole tree as SGF, with variations, comments, glyphs and marks,
  written in the browser by `libs/board` from lila's tree with `@sabaki/sgf`'s writer, root
  included (`GM`, `FF`, `CA[UTF-8]`, `SZ`, `KM`, `RU`, `HA`, `AB`/`AW`, `PL`, the root comment and
  the game info it was loaded with). A stored game's own download stays unit 4.11's server-side SGF.
- Reading back what the board wrote gives the same tree (unit 7.2's round-trip tests).

## Consequences
- `@sabaki/sgf` and `doken` join `libs/board`'s dependencies in unit 7.2 (pinned, frozen lockfile,
  COPYING.md and NOTICE updated); ADR 0014's "SGF from goban" now covers positions only.
- Every Phase 7 lila unit adapts a lila feature rather than adding a page: `/analysis`, `/paste`,
  the correspondence clock and its alarms, notifications and pushes.
- `ui/lib/src/tree` gains a Go node type beside the chess one until unit 3.17's clean-up removes the
  chess one; `path.ts` needs no change.
- Imported games keep their variations only in the stored SGF text, so a game list or the API
  sees the main line; that is lila's behaviour for PGN too.
- New `notify` content (`ScoringPhase`) means a new BSON and JSON shape in `notify` (unit 7.6).
- Removing forecasts removes a correspondence feature lichess players know; recorded in the PR and
  logs/decisions.md.

## Alternatives considered
- **goban-engine's SGF reader and `MoveTree` for the analysis tree:** already a dependency, but
  it would make two trees (goban's and lila's) to keep in step, and its reader hangs on truncated
  files, plays moves unchecked and drops glyphs (§2).
- **An analysis page built on goban's own move tree and tree view** (OGS's): less adaptation in
  `libs/board`, but a second page style beside lila's round and game pages, and lila's tree
  operations, IndexedDB copy and move list would be rebuilt. Rejected: reuse lila's page.
- **Browser-only import** (the browser reads the SGF and posts moves): no server reader, but
  `/api/import` would disappear and the stored game would trust the browser's parse. Rejected.
- **Keep variations in the stored game:** lila stores only the main line for PGN imports; a tree in
  Mongo is new schema for a feature the stored SGF text already covers.
- **Keep forecasts, rewritten for Go:** a new step format, UI and matching rules for a feature
  outside the POC scope.
- **A new "your turn in scoring" alarm instead of a `ScoringPhase` notification:** `CorresAlarm`
  rings once near the end of the time left; a one-day phase needs a message when it starts.
