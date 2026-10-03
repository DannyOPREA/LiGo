# Upstream fork log

## Lessons (curated, ≤ 30 lines — read this first)
- lila (Sept 2026): Scala 3.8.4, sbt 2.0.9, JDK 21, Pekko, ReactiveMongo, liplay; UI on Node ≥ 24, pnpm 12, TypeScript 7, esbuild, oxlint/oxfmt, stylelint, snabbdom 3.5.1 (2026-09-25, planning research).
- lila-docker states lila needs ~12 GB RAM to build; `.sbtopts` uses -Xmx8g (2026-09-25, planning research).
- lila gets ~10k commits a year, so staying mergeable isn't feasible; hard fork + monthly review (ADR 0001).
- The baseline to keep: lila compile has 17 `[warn]` lines and 0 errors; `/storm` returned 500 on an empty DB (upstream behaviour; /storm is gone since unit 3.4). New warnings or 5xx responses after LiGo changes are ours (2026-09-26, unit 0.2).
- Snapshot imports copy only Git LFS *pointers*; drop inherited `filter=lfs` attributes or clones break for git-lfs users (ADR 0009) (2026-09-26, unit 0.2).
- Claude Code auto-loads `lila/AGENTS.md` (lichess's own agent guide) while LiGo has no CLAUDE.md; it doesn't govern LiGo (2026-09-26, unit 0.2).
- Import with `git archive` and diff `git ls-files` against upstream afterwards: upstream tracks some files its own .gitignore ignores (2026-09-26, unit 0.2).
- Removing a module: grep its `lila.core.<module>` Bus messages (publishers compile fine with no subscriber) and `ui/*/src` for its URLs (kept in-repo clients like dgt aren't caught by the compiler) (2026-09-29, unit 3.5).
- Script edits: cut code blocks by indentation or with adjacent markers, never "from marker A to far marker B"; list the removed `def`s in the diff afterwards. sbt 2 caches by content, so `touch` won't re-show a file's warnings (2026-09-29, unit 3.6).
- A sibling sbt build used via `ProjectRef` passes on its libraries but not its resolvers or `excludeDependencies`: repeat them in lila and check lila's own classpath (2026-09-30, unit 3.10).
- Moving a field out of a nested case class: grep `copy(inner = ...)` too (it keeps compiling while the outer copy goes stale), and `case PerfKey.x` matches (an opaque String, never flagged as missing) when adding a perf (2026-09-30, unit 3.11).
- Lishogi forked in July 2020 and is now frozen on Scala 2.13: a warning about how hard forks age (2026-09-25, planning research).

## Entries (newest first)

### 2026-10-03 · 3.17 part 1 · lila's game holds only the Go game
- Did: `Game.go` is required and the chess game is gone from lila's `Game` (`core`), with chess
  game storage (the BSON reader and writer read and write the Go block only; `PgnStorage`, the
  chess binary formats and their keys removed), chess moves over the socket (`HumanPlay`,
  `PlayerMove`), server-side forecasts, draws by chess rules (threefold, fifty moves, insufficient
  material), `Divider`, `GameOpening`, `TreeBuilder` and `ParseImport`, the chess captcha, GIF
  export (game, position and puzzle thumbnails) and the analysis replay page. Stored chess games
  are not read: lookups by id and the per-user game queries add `Query.go` (`sz` exists). PGN
  import is an "arrives in a later update" page (SGF import is 7.5); its API answers 501. Game
  embeds in forum text stay plain links. `PerfsUpdater`, `Rematcher`, `Takebacker`, `Finisher`,
  `RoundApi`, the game and API JSON and the mobile round JSON are Go only. Tests ported to Go
  games: `ComputeMoveTimesTest`, `GameStateTest`, `AnnotatorTest`, `GoSetupFormTest`,
  `TakebackerTest` (a chess move is now refused); a new `GoStorageTest` case checks a chess
  document is not read. Tests of deleted chess code deleted with it (`RematcherTest`,
  `BinaryCLMTest`, `BinaryPieceTest`, `BinaryUnmovedRooksTest`, `PgnDumpTest`).
- Review (reviewer agent): REVIEW_PLACEHOLDER
- Worked: fixing compile errors module by module with a script that prints only `file:line: msg`;
  touching the changed files and recompiling to list their unused-import warnings.
- Didn't work / dead ends: none.
- Lessons: a lila-wide change surfaces compile errors in waves (one module's errors hide the
  modules that depend on it); budget several rounds.
- Decisions: see logs/decisions.md (3.17 part 1 row); ADR 0019 §8 amended.
- Verified by Claude: see the PR.
- Follow-ups: part 2 (FEN, PGN, UCI, variants and openings in the remaining signatures, `tree`,
  `PgnDump`, `TextLpvExpand`, `Annotator`, setup and lobby variants); part 3 (the CI check,
  scalachess-tiebreak, -test-kit and maybe -play-json, COPYING). Phase 7 removes the browser's
  forecast and GIF code in ui/analyse (7.4/7.6).
### 2026-10-03 · register backfill · docs/UPSTREAM.md lists every merged change to lila/ and lila-ws/
- Did: added 30 rows to docs/UPSTREAM.md's modification register (AGPL §5(a)), one per merged PR
  on main that changed a file under `lila/` or `lila-ws/` and had no row: units 0.4, 0.6, 0.7,
  2.1–2.4, 4.4, 4.5, 7.2, 8.3, 9.2–9.6, 9.8, 3.8, 3.10–3.16, 3.18, 3.19 part one, 6.7 part one,
  and the CI fixes PR #81 and #83. (5.4 part one's row came with 5.4 part two, PR #85.) Rows go in date order, at module level like the
  existing ones; existing rows are unchanged.
- Worked: `git log --first-parent main -- lila lila-ws` plus `git show --first-parent -m
  --name-status` per commit (the 0.4 PR is a merge commit, so `-m` is needed) gave the exact file
  lists; the repo had to be unshallowed first.
- Didn't work / dead ends: none.
- Lessons: the register only stays complete if every unit that touches `lila/` or `lila-ws/` adds
  its row in its own PR, including lockfile/workspace-only and added-only changes; 5.4 part one was
  missing too, not only the units the reviewer listed.
- Decisions: lockfile and workspace-only changes (4.4, 4.5, 7.2, 8.3) and files LiGo added inside
  `lila/` (CLAUDE.md files, tests) get rows too, since the header says "every change".
- Verified by Claude: every lila/lila-ws commit on main up to 3.16 (c98a5d31) now has a row; table
  renders (all rows have 5 cells). · Needs owner verification: none.
- Follow-ups: in-flight units add their own rows.

### 2026-09-30 · 3.16 · The other modules answer Go games in Go; analysis and puzzle placeholders
- Did: wherever 3.16's modules (and `round`'s leftovers the 3.13 reviewer listed) read the unused
  chess game a Go game carries, a Go game now gets a Go answer. The API's JSON exports and streams
  (`GameApiV2`, `GameApi`, `GameStream`, the OAuth-origin stream) send a `go` setup block
  (`JsonView.goSetup`: size, rules, komi, handicap, position) and moves as SGF points and `pass`
  (`JsonView.goMoves`), with no chess variant, opening, division, FENs or last FEN (`fens` become
  compact boards, `JsonView.goBoards`; `lastBoard` and a last move token instead of `lastFen`). The
  API move stream (`ApiMoveStream`) streams Go games: `{board, turn, lm, wc, bc}` per position
  (`ApiMoveStream.goFrames`; a resume sends none), fed live by `MoveGameEvent`, which now carries
  strings and is published for Go moves too. Push says "X played D4" / "passed"
  (`GoBridge.label`: columns skip I, rows from the bottom). `FarmBoostDetection` compares Go
  openings, `RoundMobile` sends no PGN, `RageSit` weighs no material, `SandbagWatch` uses the plain
  threshold, activity groups Go correspondence games under `go` (`LightGame.isGo`, read from `sz`).
  A finished Go game stays on its game page instead of the chess analysis replay. `/analysis`, its
  pgn and embed routes, a Go game's `/<id>/<color>/analysis`, and the puzzle pages are a plain "arrives
  in a later update" page (`SiteMessage.comingLater`); the puzzle JSON API is untouched until 8.6.
  Game titles and the game side panel show the Go setup (`GoBridge.setupName`, e.g. "9×9 • Japanese
  • komi 6.5"). Go games get no GIF export, game-viewer embed or PGN link preview. `Round.continue`
  sends a Go game to the lobby without a FEN. Tests: `GoExportTest` (5), `GoMoveStreamTest` (3), 2
  more `GoBridgeTest` cases.
- Review (reviewer agent): 2 blocking findings, both fixed: the branch predated 3.15 (merged main;
  docs conflicts only), and the move stream counted a resume as a position, flipping the turn and
  shifting clocks after it (now per-state `toMove`, a ply index that skips resumes, tested). Fixed
  from its optional list: Go games keep the chess round UI's single start step until 3.18 (an empty
  `steps` would have crashed today's round page), the push text for a resume, `NoBot` on the daily
  puzzle's JSON. Disclosed: PGN exports of Go games stay headers only (3.12) until 4.11; the game
  JSON's `immutable`/`base` still carry `variant` (3.17); the crawler view and open-graph image
  still draw chess (3.19); the placeholder and setup strings are English only, not i18n keys.
- Worked: `dev/cloud-setup.sh` fixed the strategygames 403 (the session's `~/.sbt/repositories`
  lacked PlayStrategy's repo); lila compiles and tests fully in the cloud again.
- Didn't work / dead ends: sbt 2's thin client ran only the first of several commands in one call.
- Lessons: two sbt/verify runs in one working tree corrupt each other (a false compile failure and
  "Total 0" tests); run gates one at a time. `sbt -batch testFull` in lila gives real test counts.
- Decisions: see logs/decisions.md (3.16 row); ADR 0019 §8 amended.
- Verified by Claude: see the PR.
- Follow-ups: 3.17 removes the chess paths these Go branches sit beside; 3.19 draws Go mini boards
  (and the crawler view); 4.11 SGF export; 7.4 and 8.7 replace the placeholders.

### 2026-09-30 · 3.19 (part 1) · Go options in the lobby's create-game and challenge forms
- Did: the lobby's create-game ("hook") and challenge ("friend") forms offer board size (19×19,
  13×13, 9×9 buttons; a list in screen-reader mode), rules (Japanese, Chinese) and komi (multiples
  of 0.5 up to the board's points, as go-rules' `Komi.isValid`; reset to the ruleset's standard komi
  when the rules change), sent as 3.15's `size`, `ruleset` and `komi` with `variant=1` until 3.17.
  The chess variant picker and FEN input are gone, the casual/rated choice is hidden until 5.7 and
  the rating shown is the `go` one. Saved form settings from before open as the default Go game.
  Hook and seek lists (and the chart's hover card) show each game's size, rules and komi in a "Game
  setup" column. Reusable challenge links (`ChallengeUi.genericUrl`) carry `size`, `ruleset` and
  `komi` instead of `variant` and `fen`, and the lobby reads them. The pool shortcut also requires
  19×19 Japanese standard komi, as the server's `Hook.seemsCompatibleWithPools` does. Five new
  `site.xml` keys. `lobby/tests/goSetup.test.ts`: 20 tests over a real `SetupController` and the
  rendered views in jsdom. Checked in Chromium (scratch harness with lila's built CSS) at desktop
  and phone sizes: layout, and the form values after choosing 9×9, Chinese and a komi.
- Review: no blocking code findings. Fixed from the optional ones: Go options in challenge links,
  the pool check, `props.selected` on both lists, the number-only width rule, a tests tsconfig.
  Left: the literal "Go" rating label (as `PerfType.Go`), the direct `el.value` reset in the komi
  field's change handler (snabbdom won't reset a value it thinks unchanged), unused
  `gameModeButtons` until 5.7, the dead "— Variant —" row, komi shown without locale formatting.
- Worked: testing the form through a real `SetupController` with a stub lobby, and the views by
  patching snabbdom into jsdom.
- Didn't work / dead ends: the ui test runner can't resolve a package's `@/` imports unless the
  package exports itself (a package.json change), so files the tests load use relative imports.
  The shared test i18n stub gives functions, which snabbdom renders as nothing: the test file uses
  plain strings. An ignored komi stayed in the field because snabbdom only resets a value it
  thinks changed.
- Lessons: verify.sh's ui gates don't type-check; run `tsc -p <package> --noEmit` too. Two
  verify.sh runs at once share sbt and its logs and fail spuriously.
- Decisions: logs/decisions.md (3.19 row), ADR 0019 §8 amendment (3.19 split).
- Verified by Claude: see the PR.
- Follow-ups: part 2 after 3.17 (chessground and chess UI packages); 3.16's thread switches the mini
  boards; 3.17 removes `/setup/validate-fen` and analyse's `/?fen=…#friend` link; 5.7 brings the
  rated choice back; 6.7 and 6.8 redo the lists and forms.

### 2026-09-30 · 3.15 · Game creation: every new game is a Go game, casual only
- Did: every creation path now calls `newGoGame` with go-rules' `Setup`: lobby hooks and seeks
  (`Biter`), challenges (`ChallengeJoiner`), Go rematches (`Rematcher`, back on; a chess game is no
  longer rematched), bulk pairings (`ChallengeBulk`) and pools (`GameStarter`, 19×19 Japanese).
  `newGoGame` itself makes every game casual until 5.7, whatever an older rated game, seek,
  challenge or bulk asks for; "New opponent" (`HookConfig.updateFrom`) no longer copies a chess
  variant or the rated flag. `lila.core.game.GoSetups` holds the
  default (19×19, Japanese, 6.5), `make` from form values (komi defaults to the ruleset's standard),
  the JSON block (`size`, `rules`, `komi`) and a BSON handler with the game's own keys (`sz`, `ru`,
  `km`, `hc`). `lila.core.setup.GoOptions` carries the three optional form fields. The friend, lobby,
  board-API seek, challenge-API, open-challenge and bulk forms take `size`, `ruleset` and `komi`;
  refuse rated games, chess variants and FENs; and rate in the `go` perf. Hooks, seeks, challenges
  and bulks carry the setup (seeks, challenges and bulks as an optional `go` sub-document, older
  records reading as the default); lobby, seek, challenge and bulk JSON gain a `go` block. The setup
  module's unused `fenGame` and chess variant lists went. Tests: `GoSetupsTest` (6), `GoSetupFormTest`
  (8, the setup module's first), `GoHookTest` (3), `JoinerTest` rewritten for Go (3), and a
  casual-clamp case in `GoSetupsTest` (7 in all).
- Review: the independent reviewer found 3 blocking issues, all fixed: "New opponent", rematches and
  records saved before this unit could still make rated games (the rule lived only in the forms),
  and rematching an old chess game still made a chess game. Optional, fixed: rematch challenges
  dropped their chess FEN. Left: a bulk game that fails to start is logged and skipped (its setup was
  checked when the bulk was scheduled).
- Also: one of 3.13's `GoPlayTest` clock cases failed once while sbt compiled alongside it (it
  allowed only a few tenths of a second of real time); its clock now uses a frozen `Timestamper`
  and the times are asserted exactly.
- Worked: the creation paths were few and each needed only its `newGame` call swapped; keeping the
  unused chess `variant` fields until 3.17 kept the diff small.
- Didn't work / dead ends: a Play form can't nest a mapping without prefixing its keys, so the three
  Go fields sit flat in each form and the komi check against the board size is a form-level check.
- Lessons: a rule that the forms enforce must also hold where games are made from stored records or
  old games ("New opponent", rematches, accepted challenges): put it in the one constructor they all
  call. `IdGenerator.withUniqueId` takes a `NewGame`, so a creation that can fail (`Either`) has to
  be turned into a future before it, not inside it.
- Decisions: see logs/decisions.md (3.15 row) and the ADR 0019 §8 amendment.
- Verified by Claude: see the PR.
- Follow-ups: 3.19 puts the Go options in the create-game and challenge forms and drops the `variant`
  field; 4.9 adds handicap; 5.7 turns rated games on; 6.4 gives pools their sizes. lila-ws
  passes the lobby's new `go` block through unchanged (3.14 merged first).
### 2026-09-30 · 3.14 · lila-ws: Go round payloads and live mini boards
- Did: lila-ws speaks Go on the round (ADR 0019 §6) and no longer uses scalachess's chess rules or
  formats (no `Uci`, `Fen`, `chess.json`). The browser's `move` message carries `"u": "dd"` (an SGF
  point, `[a-s]{2}`) or `"u": "pass"`, read into a new `GoMove` type (shape only; lila checks the
  rules) and relayed as `r/move <fullId> <move> …`, as lila's `RoundSocket` reads since 3.13. Chess
  moves, the old `from`/`to` form and `drop` are no longer read (they become "unexpected", as any
  unknown message). `Fens` reads lila's Go move event with play-json instead of upstream's regexes
  and sends watchers `{"t":"fen","d":{"id","lm","board","turn","wc","bc"}}`: `lm` is the point or
  `pass`, `board` lila's compact string, `turn` `black`/`white`, clocks in whole seconds. New
  `GoRoundTest` (10 tests) with move events shaped as lila's `Event.GoMove`.
- Lobby payloads: nothing to change in lila-ws. It relays the lobby's JSON (`tell/lobby`, hooks,
  seeks, pools) without reading it; the chess variants in those payloads are written by lila's
  `lobby`/`setup`/`pool` modules, which unit 3.15 owns. No follow-up needed here.
- Worked: local `dev/ligo compile ws` and `dev/ligo test ws` (lila-ws needs only scalachess, which the
  proxy serves); scalafmt fixed two files before the check passed.
- Didn't work / dead ends: `sbt --batch scalafmtAll check` fails to parse under sbt 2; run the
  commands one per call.
- Lessons: lila-ws's lobby is a pass-through; Go fields there are lila's job. Between this unit and
  3.15 no game in a dev stack can take a move over the socket (chess moves are dropped here, Go games
  are created from 3.15), and 3.18 gives the round page a Go board.
- Decisions: Claude, under the owner's 2026-09-28 delegation (logs/decisions.md, 3.14 row): Go-only
  moves now, as PLAN §5 says ("its own chess-rules use removed"); the mini-board message keeps its
  upstream name `fen` so the browser's existing socket plumbing still routes it (3.19 draws it);
  `turn` is a colour name; the move event is parsed as JSON (robust to key order; only watched games
  pay for it). The wire format matches GoPlayTest's move event unchanged.
- Order: this unit ships before 3.15, against PLAN §5's dependency column and ADR 0019 §8 (3.15
  first), because the coordinator started it when 3.13 merged and 3.15 was still being built. The
  cost is the dev-stack gap above: chess moves are dropped as "unexpected" (logged, no ack). ADR 0019
  §8 amended.
- Follow-ups: the browser's mini-board handler (`lila/ui/lib/src/pubsub.ts` `socket.in.fen`,
  `ui/site/src/boot.ts` → `updateMiniGame`, which reads `data.fen`) still expects the chess payload
  and will throw on Go updates once Go games exist; unit 3.19 (Go mini boards) must switch it to
  `board`/`turn`. lila's `Event.GoMove` writes any non-stone action as `{"pass":true}`, so Phase 4's
  resume (4.8) needs its own key. The move-event JSON in `GoRoundTest` is copied from lila's
  `Event.GoMove`, not produced by it.
- Verified by Claude: /verify, `sbt testFull` in lila-ws 13/13 (`dev/ligo test ws` runs sbt 2's
  cached testQuick, which can report 0 tests), `sbt check` (scalafix + scalafmt). ·
  Needs owner verification: none on its own; a live game over the socket once 3.15 and 3.18 land.

### 2026-09-30 · 3.13 · Round module: Go moves, passes, clock, takebacks, no draws
- Did: the round plays Go games (ADR 0019 §5–7). lila-ws's `r/move` token is read as a chess UCI
  or, failing that, a Go SGF point or `pass` (`GoBridge.actionOf`), giving a new `HumanGoPlay`
  message; `MovePlayer.goHuman` checks it with go-rules (a refusal is the usual client error with
  the fixture reason, `occupied`, `suicide`, `superko`, …), steps the Fischer clock as scalachess
  does for a chess move (`GameExt.stepGoClock`: frame lag, step, start once both sides have played),
  flags on time, and applies it (`GameExt.applyGoMove`: ply, clock history, move times, blurs). The
  move event (`Event.GoMove`) is ADR §6's: `p` or `pass`, `ply`, `cap`, `prisoners`, `ko`, `phase`,
  `board` (the compact mini-board string, `GoBridge.board`) and clock; no `dests`. It carries no
  status or winner: the end of a game follows as lila's own `end` and `endData` events, and `ply` is
  lila's absolute ply (a handicap game starts at 0). The second consecutive pass or the 1,000th ply
  ends the game as "unknown finish" with no winner, and that last move earns no increment, as in chess. The
  move bus event `MoveEvent` carries strings (board, move) instead of FEN and UCI. Go games have no
  draws (`drawable` and `forceDrawable` are false, `cannotLose` never applies, running out of time
  never reads the placeholder chess position's material), though a player who left can still be
  claimed against (`goneClaimable`); they send no chess legal moves in the round JSON, refuse chess
  moves (and chess games refuse Go moves), refuse moves from an AI seat, and offer no rematch until
  3.15 can create a Go game. Takebacks use
  go-rules' `undo` (`Rewind.go`), with the clock restored from the clock history as for chess; the
  offer message numbers the moves 1, 2, 3… as SGF points. Resign, abort, flagging and more time
  needed no change. Tests: `GoPlayTest` (11: a stone, a pass and two passes, a capture, Black-first
  and handicap clocks, the increment, a takeback of a stone and of a pass and a two-ply one, no
  draws, the end on two passes but not pass-stone-pass, the 1,000-ply end in even and handicap
  games), 2 more `GoBridgeTest` cases, `GoMoveReaderTest`, `GoGoneTest`.
- Review: the independent reviewer found 2 blocking issues, both fixed: making `forceDrawable` false
  also hid the "opponent left" claim (its other readers), and the two game endings were untested. Of
  its optional findings, fixed: no increment on the last move, the out-of-time check, the takeback
  numbering, rematches, the AI seat, stronger takeback tests; disclosed: the event's absolute ply
  and missing status.
- Worked: the round's own flow (actor, proxy, finisher, resign, abort, flagging, more time) needed
  no change; only the move path and three chess-only checks did.
- Didn't work / dead ends: none.
- Lessons: scalachess steps the clock inside `chess.Game`, so a move that skips chess must repeat
  `applyClock` itself; its "start the clock" test reads the ply before the move. Before turning a
  predicate off for Go, grep every reader of it: `forceDrawable` also gated the "opponent left" claim.
- Decisions: see logs/decisions.md (3.13 row).
- Verified by Claude: see the PR.
- Follow-ups: 3.14 sends the Go tokens from lila-ws and relays `board` to mini boards; 3.15 creates
  Go games (rematches of Go games come back then); the API move stream (`ApiMoveStream`), the round
  page's move list (`StepBuilder`) and the chess readers the reviewer listed (`PushApi`'s last move,
  `FarmBoostDetection`, `RoundMobile`'s PGN) stay chess-only until 3.16–3.18.

### 2026-09-30 · 3.12 · Game module: Go games stored and loaded
- Did: lila's `Game` gained `go: Option[GoGame]` beside `chess` (ADR 0019 §3); for a Go game
  `turnColor` comes from `GoGame.toMove`, `perfKey` is `go`, and `withGo` takes a new Go game with
  its ply (placements and passes; a resume is not a ply). `newGoGame` (core) builds a Go game with an
  unused standard-start chess game, its starting ply from `GoBridge` and the Fischer clock set to the
  side that moves first. `GoBridge.plies` and `GoBridge.maxPlies` (1,000, ADR 0019 §7). libs/go-rules
  gained a public `GoGame.replay(setup, actions): Either[ReplayError, GoGame]` that never throws;
  a refused action returns the game before it. New `lila.game.GoStorage`: the Go block of ADR 0019 §4
  (`sz`, `ru`, `km` as komi × 2, `hc` omitted at 0, `ip` as `{b, w, m}` SGF point strings, `ac` as
  2-byte big-endian actions). The BSON reader branches on `sz`: it replays `ac`, takes the ply from
  the replay (logging a mismatch with the stored `t`), and closes play again at the ply cap; the
  writer writes the Go block and none of the chess keys; `GameDiff` writes `ac`. The game JSON
  (`JsonView.base`) has no `fen` for a Go game and a `go` block (setup, moves as SGF points and
  `pass`/`resume`, prisoners, phase, ko). `insertDenormalized` writes no FEN for Go games. Tests:
  `GoStorageTest` (8: new-game ply and clock side, ply vs actions, stored keys, round trips with a
  capture, passes, a resume, a handicap and a custom position, a corrupt document, `GameDiff`, the
  replay benchmark), 2 new `GoGameTest` cases.
- Worked: the replay is cheap: a 300-move 19×19 game replays in a median 9.4 ms (20 runs, cloud
  CPU), so a page of 20 Go games spends about 0.2 s replaying; no denormalised prisoner field yet.
- Didn't work / dead ends: none.
- Lessons: a BSON reader that branches on a key can keep the old path untouched by turning its
  decoding into a `def` that only the old branch calls.
- Decisions: see logs/decisions.md (3.12 row).
- Verified by Claude: see the PR.
- Review (reviewer agent): 1 blocking finding, fixed: the PLAN row's game lists and exports. The
  user's game list (`UserGameApi`) and the now-playing list (`ownerPreview`) sent a chess FEN and last
  move for Go games; they now send the `go` block instead, and a Go game's PGN has headers only.
  Fixed from its optional list: the reader takes a Go game's starting ply from its setup (a stored
  `st` that disagrees is logged), a `turnColor` check that couldn't fail now checks ply parity (which
  lila still reads), a 1-stone handicap test, the `go` JSON carries a custom starting position,
  loading more than 2,001 stored actions is logged, and `GameDiff` is tested on a takeback. Its
  lesson: verify's lila gate runs `testQuick`, which can skip new tests; run them with `testOnly`.
- Follow-ups: 3.13 plays Go moves through `withGo` and enforces the ply cap; HTML mini boards still
  draw a chess board for Go games until 3.19; the API's bulk export (`GameApiV2`,
  `GamesByUsersStream`) gets Go moves in 3.16 and SGF in Phase 4 (4.11). Bulk paths replay every
  game (about 8 ms per 300-move 19×19 game, so ~9 s of CPU per 1,000): 3.16 decides between a lazy
  replay and a denormalised field.

### 2026-09-30 · 3.11 · Core types: lila's Game holds ply and clock, GoBridge, the go perf
- Did: lila's `Game` (`modules/core/.../game/Game.scala`) gained `ply`, `startedAtPly` and `clock`
  fields instead of exporting them from `chess.Game`; `turnColor` is now ply parity (`ply.turn`).
  The chess game still carries copies until 3.17: chess rules get them through `chessState`, and a
  chess move or rewind hands its result back with `withChess`. Callers moved: the BSON reader/writer,
  `newGame`, the pool's game, move application, clock changes (start, berserk, more time, finish),
  takebacks, the challenge and setup starting positions, FEN writers (game/round JSON, the round
  controller, `insertDenormalized`) and the round's move player. New `GoBridge` in `core`
  (`lila.core.game.GoBridge`): colour conversion both ways, a Go game's starting ply for lila's
  parity rule, and the `go` perf key. New perf `go` (`PerfKey.go`, id 30, `UserPerfs.go`, stored as
  `go` in `user_perf`, `PerfType.Go` with the disc icon and plain-English name). Tests:
  `GoBridgeTest` (lila's turn equals go-rules' `toMove` over 60 actions for handicaps 0–9 and over 40
  for custom positions with either player to move) and `GameStateTest` (ply, turn and a clock change
  reaching the chess rules).
- Worked: making the three fields constructor parameters without defaults let the compiler find
  every place that builds a `Game` directly (two: the BSON reader, the pool); the rest go through
  `newGame`, which copies them from the chess game.
- Didn't work / dead ends: the compiler can't find `copy(chess = ...)` calls, which compile but would
  leave lila's ply and clock stale; they were found by grepping `chess = `, `.chess.` and `.chess)`
  and moved to `withChess`/`chessState` by hand.
- Lessons: when a field moves between two nested case classes, grep for `copy(` of the inner one
  as well as constructions: `copy` keeps compiling while the outer copy goes stale.
- Decisions: see logs/decisions.md (3.11 row).
- Verified by Claude: see the PR.
- Review (reviewer agent): no blocking findings. Fixed from its optional list: `History.apply` had no
  `go` case (a MatchError once charts ask for it; now empty), the game-download page showed a "Go"
  perf toggle (filtered out), two `GameStateTest` checks could not fail (now check the stored chess
  copy and White's remaining time after more time was given), ADR 0019 §8 gained a 3.11 amendment
  line, and STATUS's two 3.8 lines now agree. Lesson from it: `PerfKey` is an opaque `String`, so
  the compiler never flags a missing `case PerfKey.x`; grep for them whenever a perf is added.
- Follow-ups: the `go` perf reaches leaderboards, the rating history (`History`), perf stats and the
  browser's perf lists when Phase 5 rates Go games (5.3–5.6); 3.12 adds `go: Option[GoGame]` and
  makes `turnColor` come from `GoGame.toMove` for Go games; the Go setup is stored in 3.12.

### 2026-09-30 · 3.8 · Rebrand text: strings, footer, FAQ, contact, emails
- Did: "Lichess"/"lichess.org" → "LiGo" in the English source strings that kept pages still use
  (92 strings; strings only removed features use keep their text), and the same keys dropped from
  `translation/dest/*/en-US.xml` so US-English visitors fall back to them (68 entries). The FAQ opens
  with four new LiGo questions (what it is, the name, what it's built from, which rules; 15 new faq
  keys) and loses the chess-only ones (correspondence engines, time-control formula, variants,
  ACPL, insufficient material, en passant, threefold, titles, LM, trophies, bots). Home: "About
  LiGo" opens `/faq#what`; the app and ads links and lichess's Mastodon/Discord/Bluesky/YouTube/
  Twitch links went, GitHub points at LiGo's repo; site description and title say Go. Contact: bugs
  and security go to LiGo's GitHub; the broadcast, "buying Lichess" and /ads answers went. Emails:
  the service-note footer links the site's own URL (`Mailer.txt.addServiceNote(routeUrl)`,
  `standardEmail(routeUrl, …)`, `serviceNote(routeUrl)`), "The LiGo team", welcome text about stones.
  Developers page: CSP `frame-src 'self'` (was lichess.org only, which blocked its own embeds), the
  broadcast embed went, analysis embed uses the site's URL; pages menu loses the lichess database and
  ads links. Manifest name, short name and description say LiGo/Go. About 30 hard-coded texts in
  auth, appeal, account, report, CMS, OAuth, chat, mod and UI (notification title, patron tooltip,
  browser nag, dasher's crowdin link removed) say LiGo. brand.spec.ts gains 10 tests.
- Worked: reverting the mechanical rename for keys no kept code uses, by comparing each changed key
  with a grep of `modules`, `app` and `ui` (excluding the generated `key.scala` and `i18n.d.ts`).
- Didn't work / dead ends: the first page run still showed "Is Lichess lagging?": Playwright's
  browser asks for en-US, and lila serves `translation/dest/*/en-US.xml` over the English source. A
  Python rewrite without `newline=''` turned CRLF files into whole-file diffs.
- Lessons: English has two sources in lila, `translation/source` (en-GB) and `dest/*/en-US.xml`;
  change both or drop the en-US key. After a translation edit, recompile lila before `dev/ligo up`
  (the i18n `.ser` files are generated at compile). Stale `/var/run/docker.pid` from a restored
  container stops dockerd; delete it and start dockerd detached.
- Decisions: see logs/decisions.md (3.8 row). Editing `translation/dest/*/en-US.xml` breaks the
  "never hand-edit dest" rule on purpose: LiGo doesn't sync crowdin, and only deletions were made.
- Verified by Claude: see the PR.
- Follow-ups: other languages and removed features' strings still say Lichess (i18n tidy-up); /app
  and /mobile describe lichess's app; `/about`, `/privacy`, `/terms-of-service` are CMS pages empty on
  a fresh database; the contact page's chess bug answers (en passant, castling, insufficient material)
  go with 3.17; the default CSP still allows YouTube/Twitch/Vimeo frames; dead OAuth scopes (Team,
  Msg, Engine, Bot.Play, Board.Play, Racer.Write) stay for an API unit, since removing a scope changes
  stored tokens and the public API; tournament i18n keys, sounds and CSS stay for the tidy-up; the
  Arabic `lichessCombinationLiveLightLibrePronounced` test and `LichessDay`, the `lichess` system
  user id and mobile-UA detection are code, not text. From the review: the FAQ's rating answers
  still talk about chess organisations, FIDE and variants (Phase 5 rewrites them); the FAQ and chat
  now link `/page/username-policy`, `/page/userstyles` and `/page/chat-etiquette`, CMS pages empty on
  a fresh database; the developers page's game and analysis embeds show chess (3.17); DGT strings
  stay lichess's until 3.18 removes DGT.
- Review: reviewer found 1 blocking issue (the email-confirm help page told users to email
  `…@verify.lichess.org`; that step went) and 9 smaller ones: fixed the features.xml line endings,
  kept the DGT strings, made the Patron tooltip plain "Patron", pointed the console message at
  /source; the rest are follow-ups above or owner checks.
### 2026-09-30 · 3.10 · Wire libs/go-rules into lila's sbt build
- Did: `lila/build.sbt` loads `libs/go-rules` as a source dependency
  (`ProjectRef(file("../libs/go-rules"), "go-rules")`) and lila's `core` depends on it. lila's
  build settings gained PlayStrategy's Maven repo and go-rules' three engine exclusions
  (`lila/project/Dependencies.scala`). A smoke test in `core` (`GoRulesSmokeTest`) plays a capture
  and a refused suicide through `ligo.gorules` and checks that Fairy-Stockfish, aalina and samurai
  classes are not loadable. CI: the lila job resolves, then runs `libs/go-rules/check-pin.sh` before
  compiling and testing; any `libs/go-rules/` change now triggers the lila build (`dev/ci/changed.sh`,
  its self-test updated). Docker mode: the lila container mounts `libs/` (compose.yml, with a new
  `dev/tests/run.sh` check). COPYING.md, go-rules' README/CLAUDE.md and ADR 0019 §8 updated.
- Worked: sbt 2 loads the sibling build with its own `project/` (same scalafmt plugin) and
  compiles it before `core`; all of lila compiled with no source changes. The runtime classpath
  gains only strategygames and joda-time (diffed against main's `export Runtime/fullClasspath`).
- Didn't work / dead ends: go-rules' `excludeDependencies` don't reach projects that depend on it,
  so the first build put Fairy-Stockfish (native), aalina, samurai, javacpp, guice and berkeleydb on
  lila's classpath; the exclusions are repeated in lila's build settings. The cloud container's
  `~/.sbt/repositories` was written by an older setup script without PlayStrategy's repo, so
  `dev/cloud-setup.sh` had to be rerun.
- Lessons: an sbt source dependency (`ProjectRef` to another build) passes on its library
  dependencies but not its resolvers or `excludeDependencies`; check the dependent's classpath with
  `export Runtime/fullClasspath`, not the library's own.
- Decisions: see logs/decisions.md (3.10 row).
- Verified by Claude: see the PR.
- Review (reviewer agent): no blocking findings; its testFull run: 400 tests, 0 failed. Fixed from
  its non-blocking list: PlayStrategy's repo now comes last in lila's resolvers (after Maven
  Central), so it is only asked for what no other repo has; `dev/ligo`'s rules runs no longer add
  a second `/libs` mount; verify.sh's lila gate also runs for `libs/go-rules` changes; stale
  comments in go-rules' build.sbt and docs/UPSTREAM.md.
- Follow-ups: 3.11 is the first unit whose code uses go-rules from lila (`GoBridge` in `core`).

### 2026-09-30 · 3.7 · Remove the extras and search
- Did: deleted lila modules `streamer`, `coach`, `video`, `feed`, `plan`, `recap`, `tv`, `search`
  and `gameSearch`, their controllers (plus `Editor`), views, routes and config blocks, the
  `BoardEditorUi` page, `RecentTvGames`, the core bus events (`TvSelect`, `ChangeFeatured`,
  streamer online/start, plan charge/month/start/gift/expire) and the sbt dependency on the
  lila-search client. The top menu lost its Learn (coaches) and Watch sections, the donate links,
  the board editor and advanced search; the lobby lost the featured TV game, live streams, the news
  feed and the donate/swag boxes; the profile lost coach/streamer trophies and the advanced-search
  games tab; the mod zone lost Patron payments and "Free Patron"; the mobile API lost `/api/mobile/watch`.
  lila-ws lost `Tv.scala`, `Streamer.scala`, `tv/select`, `streamers/online`,
  `startWatchingTvChannels`, the `?userTv=` round parameter and the coach/streamer `seenAt` updates;
  the browser lost `ui/recap`, `ui/editor`, the streamer/coach/video/feed/plan/TV/game-search
  bundles and `swiper` (COPYING §1.2). Smaller visible changes: the mod inquiry's quick rated
  wins/losses links, the following list's game-count links, the analysis board's `b` hotkey and
  Board editor button, the lobby position box's editor button, the home page's "games in play" link
  (now plain text), the developers page's TV embed, the `/donate` redirect and the coach welcome
  email are gone; PerfStat's "View the games" opens all games; user `tvTime` is no longer added up.
  Public API: `streaming` and `streamer` leave `/api/users/status`, `/api/user/:u` and the mobile
  profile; `/api/tv/*`, `/api/streamer/live` and `/api/patron/*` are gone.
  Account deletion still deletes a stored streamer or coach profile, and the personal data export
  still includes it (raw deletes/reads on the kept `streamer` and `coach` collections), because
  those profiles hold personal data (name, bio, links, picture).
- Worked: the lila-ws and browser workers on disjoint paths again; compiling once and fixing the
  18 `Lila.scala` wiring errors was all the server needed after a grep-driven first pass.
- Didn't work / dead ends: merging main into the WIP branch after 3.6 was squash-merged produced
  36 conflicts (the WIP still carried 3.6's unsquashed commits); cherry-picking the WIP commits onto
  a fresh branch from main applied cleanly. The browser worker also dropped stored notification
  renderers (stream start, plan start/expire, recap), the 3.6 lesson again; restored without links.
- Lessons: after a squash merge, move WIP with `git cherry-pick -n <wip commits>` onto main, not
  `git merge main`. Grep string literals for every removed path prefix (`/games`, `/tv/frame`,
  `/patron`): compile only catches `routes.X` calls. When a module goes, check `AccountTermination`
  and `PersonalDataExport` for the personal data it deleted or exported. Deleted CSS bundles can have callers outside their feature (`bits.tv.embed` for
  the puzzle embed, `bits.search` for the games download page): grep every removed bundle name.
- Decisions: see logs/decisions.md (3.7 row).
- Verified by Claude: see the PR.
- Follow-ups: the round page's user-TV mode (`/@/x/tv`, `OnTv`, `userTv`) stays dormant until the
  round rewrite (3.18); `Permission.{Coach,Streamers,FreePatron,PayPal}`, the `Modlog` patron action
  name, `PatronMonths`/colours (existing patrons keep their wings), user `tvTime` counts, the
  `streamStart` notification pref row and the recap/streamer/coach/video i18n keys stay (stored or
  harmless); `gameRepo.setTv` is unused. `PushApi.streamStart`/`recap`, `bits.flatpickr`,
  `bits.confetti`, `bits.feature` and the `flatpickr`/`canvas-confetti` npm packages now have no
  callers (removing the packages is a dependency change for a later tidy-up). The user game export
  with a perf filter reads all of the user's games (no index on perf); fine for the POC.
- Review: independent reviewer found 2 blocking issues (undisclosed loss of the streamer/coach
  profile delete and export; three kept pages linking to removed ones: lobby `/games`, developers TV
  embed, `/donate`), both fixed; also fixed the tablet lobby grid (puzzle no longer spans both
  columns), and removed the orphan TV embed bundle, the dev-mode fake TV game, the donate/patron nav
  CSS and the dasher `coach` flag.

### 2026-09-29 · 3.6 · Remove forums, blogs, teams, inbox and classes
- Did: deleted lila modules `forum`, `forumSearch`, `ublog`, `team`, `teamSearch`, `msg` and `clas`,
  their controllers, views, routes (`team.routes`, `clas.routes`, the class login, the inbox
  report form, the mod "full comms export") and core APIs (`lila.core.{forum,msg,ublog,team}`,
  `TeamHelper`, `LogApi`). Callers lost their forum/blog/team/inbox/class parts: activity (forum
  posts, blog posts, teams), the profile (forum/blog counts, team list, blog cards, inbox button),
  the mini profile (class real name), the lobby (blog carousel, class list, "unread message from
  Lichess" notice), top nav and footer links, the mod pages (inbox messages, blog carousel,
  student/teacher sections), the personal data export, account closing, search-by-id, link checks,
  the PGN/JSON team tags, push notifications and the markdown realms (only `cms` is left).
  Every system private message is gone: mod warnings and auto-warnings are only logged, the
  reporters' "action taken" message, the kid mode, welcome, patron and "new wing" messages and the
  GitHub token-revoked message are no longer sent. lila-ws lost its team channel and inbox
  messages; the browser lost `ui/msg`, `ui/team`, the forum/blog/class bundles and five npm packages
  (COPYING §1.2).
- Worked: lila-ws and UI by workers on disjoint paths again; a full grep for
  `lila.(forum|ublog|team|msg|clas)`, their routes and `lila.core.*` messages before the first
  compile left only a handful of compile errors.
- Didn't work / dead ends: a "cut from marker A to marker B" script edit silently deleted
  everything between two far-apart markers twice (ModlogApi, PersonalDataExport); the compiler
  caught both, and the fix was to restore from git and cut by indentation. Also, touching files
  doesn't make sbt 2 recompile them (its cache is by content), so to see all warnings I appended a
  newline to every changed file and let scalafmt remove it.
- Lessons: cut blocks by indentation or with adjacent markers, then list the removed `def`s in the
  diff to check nothing else went; sbt 2 caches by content, so `touch` won't re-show warnings.
- Decisions: see logs/decisions.md (3.6 row).
- Verified by Claude: see the PR.
- Follow-ups: dead but harmless: `Modlog.isForum`, the forum/blog/team `Modlog` action names and
  permissions (`ModerateBlog`, `ModerateForum`, `Teacher`, `FullCommsExport`, stored),
  `PublicSource.{Team,Forum,Ublog}` and their shutup text types, the `Team.*` and `Msg.*` OAuth scopes
  (3.8), notification contents for mentions, private messages and teams (stored ones render as
  plain text with no link, never created), the bulk challenge `message` field, the teacher
  account-close branch, the push `forumMention`/`privateMessage` keys, the forum/blog/team/class
  i18n keys, the `clas.*` monitoring keys. Still to tidy: the preferences page's mention, private
  message and team-update notification rows and the "who can message you" setting; the orphaned
  `bits.markdownTextarea` bundle and `Page.markdownTextarea`; the unused `@yaireo/tagify` and
  `debounce-promise` entries in `ui/mod/package.json`. Mod warnings now reach only the modlog, so a
  player closed for repeated rage-sitting never saw a warning; send warnings as notifications
  later. Account deletion and the data export skip the old forum, blog, team and inbox
  collections: fine on a fresh database, a GDPR gap if lichess data is ever imported. Beta pages
  now need the `Beta` permission (the beta-testers team is gone).
- Review (2026-09-29): no collateral deletions (removed names compared per file). Three findings
  fixed before the PR: the lobby's donate/swag box stayed hidden because the deleted blog carousel
  was what made it visible; the debug dialog still posted to the removed `/diagnostic`; stored
  mention, message and team notifications were hidden in the bell (renderers restored without
  links). Also relabelled the mod "Send PM" warning option, and removed the `msg multi` dev command,
  the `ClasBus` core messages, the forum/team/blog/message config blocks and blank lines in
  build.sbt. Lesson: deleted TS can have side effects on kept DOM; grep it for `.style` and
  `querySelector` on elements that stay.
- CI: CodeQL flagged 7 "incomplete hostname regex / string escaping" alerts in
  `ui/lib/src/chat/spam.ts`, upstream code this unit only trimmed (the team-URL check). The dots
  were escaped at runtime; the list now holds the escaped regex sources directly (same regex,
  checked by comparing the built sources), so CodeQL sees them.

### 2026-09-29 · 3.5 · Remove engines and bots
- Did: deleted lila modules `fishnet`, `irwin`, `evaluation`, `insight`, `tutor`, `jsBot` and
  `bot`, their controllers (including `PlayApi`), views and routes; `mod` lost its engine
  assessment (`AssessApi`, the Irwin/Kaladin/assessment menu and dashboard links, the games-page
  ACPL/blur columns) and now depends on `game` and `analyse` directly (PLAN §5). Games against the
  computer are gone: `POST /setup/ai`, `POST /api/challenge/ai`, `AiConfig`/`ApiAiConfig`, the
  round's fishnet-move and bot-play messages (`FishnetPlay`, `BotPlay`, `BotConnected`,
  `ResignAi`, `FishnetStart`), `UciMemo` and the Board API channels its game stream used. Also
  gone: requesting a server analysis, report auto-analysis, the fishnet key email, the "Chess
  Insights" profile link, the puzzle "my openings" (from insight), the external-engine API with
  its CSP and config, and the fishnet/insight/explorer/externalEngine/kaladin config blocks.
  lila-ws lost `r/bot/online`. Browser: `ui/botDev`, `ui/botPlay`, `ui/insight`, `ui/tutor`,
  `ui/lib`'s ceval and bot code and the six Stockfish/zerofish npm packages; analyse lost the local
  engine, threat, practice, retrospect and live-annotate modes; puzzle, round, lobby and editor
  lost their engine hooks and the "play against the computer" buttons. Also cleaned the unused
  warnings 3.2 and 3.4 left behind (TeamShowUi `toursFrag`, `PuzzleComplete`'s `api`).
- Worked: same recipe as 3.4 (lila-ws and UI by workers on disjoint paths); `dev/ligo compile lila`
  after every cut, fixing warnings as they appear rather than at the end.
- Didn't work / dead ends: an incremental compile only prints warnings for files it recompiles, so
  3.4's unused-symbol warnings only showed up during 3.5.
- Lessons: removing a module that answers on the Bus (fishnet, bot) leaves publishers that compile
  fine and do nothing; grep the `lila.core.<module>` messages and delete their publishers too.
- Decisions: see logs/decisions.md (3.5 row).
- Verified by Claude: see the PR.
- Follow-ups: the Board API seek (`/api/board/seek`) stays without a way to play the game by API
  (decide with the API work); the `Engine.*`, `Bot.Play` and `Board.Play` OAuth scopes are dead
  (3.8 with the other scopes); `analyse` still has `Analyser`/`RequesterApi`, which only fishnet
  fed; `HTTPRequest`'s fishnet client kind, the `mon` fishnet/cheat keys, `Namer`'s "Stockfish
  level" for stored AI games and the `ai` fields in the UI's game types are dead; round and editor
  pages still allow WebAssembly in their CSP; `ui/lib/src/eval.ts` uses lichess's centipawn curve
  (Phase 4); the analysis/puzzle i18n engine keys stay for the i18n clean-up. Known breakage until
  later units: `/dgt/play` used the Board API game stream and moves, so the DGT board can't play a
  game (3.18 removes DGT); API clients still get rematch offers in the event stream but can't
  accept or decline them through the API. Also: the analysis grid keeps an empty eval-gauge column;
  API-only users are no longer marked online (bot's `onlineApiUsers` went); the insight-sharing
  preference stays on the account page (the preference form requires it; stored field); the Patron
  page's "40 server analyses a day" (3.7); the embedded game viewer's "practice with computer"
  label; `Api.eventStream`'s rate-limit message points at lichess's Board API docs.
- Review: 2 blocking, both fixed: the DGT and API-rematch breakage is now disclosed (above and in
  decisions.md); the import page's "Request a computer analysis" checkbox, which did nothing any
  more, is gone. Also removed the leftovers it found: the fishnet key page, the online-bots page and
  its CSS, the polyglot bundle, the mod games page's analyse handler, the fishnet CLI example and
  the unsubscribed `CheatReportCreated` message. Lesson: grep `ui/*/src` for the URLs of a removed
  API; kept in-repo clients (dgt) aren't caught by routes or the compiler.

### 2026-09-29 · 3.4 · Remove chess training and openings
- Did: deleted lila modules `storm`, `racer`, `coordinate`, `learn`, `opening`, `explorer` and
  `evalCache`, their controllers, views and routes, and puzzle streak mode inside `puzzle` (the
  streak page and API, `PuzzleStreakApi`, the streak fields of the round form, the Storm/Racer/Streak
  run events in `lila.core.misc.puzzle`). Removed the class "learn" progress tab, the masters-game
  import redirect, the `/api/cloud-eval` endpoint and its rate limit, the opening explorer entry in
  the user menu and the keyboard help, and the menu, profile and Patron-page links. lila-ws lost the
  racer actor and channel, `StormSign`, the whole `evalCache` package (evalGet/evalPut/evalGetMulti)
  and its two tests, and the `yolo` Mongo connection only it used. Browser: `ui/storm`, `ui/racer`,
  `ui/coordinateTrainer`, `ui/learn`, `ui/opening`, `ui/lib`'s puzzle-run code, streak mode in
  `ui/puzzle`, the explorer and cloud-eval code in `ui/analyse`; `public/images/learn` and the
  racer-car and storm fonts; `@fnando/sparkline` and its types left the lockfile.
- Worked: the 3.2/3.3 recipe; lila-ws and UI done by two workers in parallel while the server was
  stripped in the same checkout (disjoint paths, no commits by workers).
- Didn't work / dead ends: `sbt test` in lila-ws prints "Total 0" when nothing changed (testQuick);
  `sbt "testOnly *"` gives the real count. PR #33's lila CI job hung silently for an hour after
  "set current project" (as main's 3.2 run did) and passed on one re-run.
- Lessons: a silent lila CI hang right after project load has happened twice; it isn't the diff.
- Decisions: fishnet's cached-eval lookup is stubbed to "none" in app/Env.scala until 3.5 removes
  fishnet; tutor's opening links point at the analysis board until 3.5; activity and profile keep
  stored storm/racer/streak scores (ADR 0019: stored fields stay) and show old ones without links;
  the explorer/tablebase endpoints in config stay (fishnet and the CSP still read them until 3.5).
- Verified by Claude: see the PR.
- Follow-ups: the `Racer.Write` OAuth scope and storm/racer monitoring keys are dead (3.8 with the
  other dead scopes); `ui/analyse` practice mode no longer asks the tablebase and learn-from-mistakes
  no longer skips masters' moves (both go with the engine in 3.5); the Storm glyph stays in the
  icon font; storm/racer/learn i18n keys stay with the rest of the i18n clean-up. Also:
  `ui/analyse`'s fork-variation hover arrow went with the explorer hover it relied on (3.5 or
  later, with the engine); the Patron page (3.7), recap slides (3.7) and SitePages still mention
  chess basics, Storm/Racer/Streak, openings or the explorer; `UserApi.addPuzRun` and the streak
  and cloud-eval monitoring keys are dead code; an old cached puzzle page that still sends
  `streakId` now gets a normal rated round.
- Review fixes: the menu's "Learn" heading no longer opens the coach list for kid accounts (it
  opens the first link the viewer may see, or the section is left out); profiles still show old
  storm/racer/streak scores, without links.

### 2026-09-28 · 3.3 · Remove studies and broadcasts
- Did: deleted lila modules `study`, `relay`, `practice`, `studySearch`, `fide`, `title` and the
  core interfaces `lila.core.{relay,fide,practice}` (`lila.core.study` stays: irc, push, timeline,
  notify and the router's path bindables still name its types); their controllers, views and
  routes; the relay-only "Public chats" mod page. Kept modules (activity, api, mod, report, user,
  web, coach, clas, game, timeline) lost their hooks. lila-ws lost the study actor, relay crowd,
  study Redis channel, IPC messages and Mongo lookups. Browser: `ui/fide` and the study, relay,
  gamebook and practice-module code in `ui/analyse` and `ui/bits` deleted; "continue as a study"
  buttons removed from analysis, editor and puzzle; `public/fide` deleted, and with the
  /practice page its CSS and `public/images/practice` (CC BY 3.0 icons, so COPYING.md no longer
  lists them). The Public chats page's UI, the relay stats chart and orphaned CSS went too;
  lila-ws keeps upstream's rule that rooms over 20 users send only a head count.
- Worked: the 3.2 recipe (delete, compile, strip callers, keep stored fields). `PublicFideIdOf`,
  which game and api still need, is a stub that returns no FIDE id.
- Didn't work / dead ends: running the removal in a git worktree broke lila-ws's build (sbt-git's
  JGit can't read a linked worktree's `.git`); the work moved back to the main checkout and the
  build.sbt workaround was dropped.
- Lessons: don't run sbt builds from a git worktree here; use the main checkout.
- Decisions: stub FIDE ids rather than touch game/api; remove the Public chats mod page (it only
  listed broadcast chats); keep `lila.core.study` until its remaining users go (3.6/3.7/3.13).
- Verified by Claude: see the PR (verify.sh, UI build, lila-ws `sbt check` and tests, site smoke).
- Follow-ups: study/relay i18n keys; stale study/broadcast texts in coach, FAQ, game and dev pages
  and the broadcast-embed section of SitePages (3.8); dead prefs, permissions and OAuth scopes;
  unused analyse npm deps (tagify, sortablejs, debounce-promise, shepherd.js; a dependency change);
  the data export no longer includes title requests; notify's study-invite and timeline's study entries render
  nothing for old data and go with 3.13.

### 2026-09-28 · 3.2 · Remove tournaments and events
- Did: deleted lila modules `tournament`, `swiss`, `simul`, `gathering`, `event` and core
  interfaces `lila.core.{tournament,swiss,simul}`; their controllers (incl. TournamentCrud,
  UserTournament), views, routes, `ui/` packages (tournament, swiss, simul) and lila-ws actors
  (Tour/Swiss/SimulClientActor, their Redis channels, IPC messages and Mongo lookups). Stripped the
  hooks in ~95 kept files (activity, api, round, lobby, game, team, mod, user, views). 264 files
  deleted, ~29k lines.
- Worked: keeping the stored fields (game `tournamentId`/`swissId`/`simulId`, chat
  `PublicSource.Tournament/Swiss/Simul`) avoided a schema change; nothing writes them now. Also
  removed the orphaned `bits.tourForm`, `bits.teamBattleForm` and `bits.event` bundles and the
  lobby's `tours` grid area.
- Didn't work / dead ends: an incremental `dev/ligo compile lila` only re-prints warnings for files
  it recompiles, so one run can hide unused-import warnings elsewhere.
- Lessons: after a large deletion, audit warnings from a run that recompiles broadly (verify.sh's
  log), not a single incremental compile. Removing workspace packages changes `pnpm-lock.yaml`,
  and CI's meta check then wants COPYING.md changed too. verify.sh runs neither the meta checks nor
  lila-ws's `sbt check` (scalafix + scalafmt): run `cd lila-ws && sbt check` after lila-ws edits.
- Decisions: keep the stored ids as unused fields rather than migrate data (a 3.2 call, not in
  ADR 0019's key list); leave dormant round-page client code (tour standing, tour/swiss/simul
  links) for 3.18 and dead socket plumbing (TourStanding, SimulMoveEvent, SendToFlag) for 3.13; leave i18n
  keys and the tournament sounds for later clean-ups (logs/decisions.md).
- Verified by Claude: verify.sh (lila compile, scalafmt, lila + lila-ws tests, ui lint/format/tests),
  UI build, independent review. · Needs owner verification: none specific; the lobby no longer shows
  tournaments or simuls.
- Follow-ups: `public/sound/*/Tournament*` sounds, `.team-events` CSS, the `prizeTournamentMakers`
  setting and tournament i18n keys go with 3.6 (team) or 3.8 (rebrand).

### 2026-09-28 · 3.1 · Strip non-free lichess assets
- Did: deleted every asset upstream's `lila/COPYING.md` marks non-free or non-commercial (logo,
  favicons, 17 NC and 9 non-free piece sets plus 3D Staunton, the standard/instrument/other/robot/
  woodland/lisp sounds), plus what the directory audit found: lichess's own 77 flairs (all of
  `bin/flair/custom.txt` but neovim and helix), lichess images, all of `public/lifat`, the
  ChessPursuit mini-game, the unlisted governor and kosal sets, and the logo glyph in the icon font
  (removed from the .sfd; cmap entry and outline dropped from the .ttf/.woff2 with fontTools, since
  fontforge isn't in the cloud). New two-stone LiGo logo (SVG + PNGs, favicon.ico,
  apple-touch-icon) generated by `bin/gen/ligo-logo.mjs` with Playwright's Chromium; the loading
  spinner now draws that logo; small UI images redrawn in `images/ligo/`. Default sound set `sfx`;
  default background the AGPL wood4 board image. COPYING §1.1 and UPSTREAM updated.
- Worked: a script listing every `images/`, `logo/`, `sound/`, `piece/`, `flair/` path in code and
  checking it exists. Remaining misses are all in modules and packages units 3.2–3.7 delete.
- Didn't work / dead ends: that script missed inlined SVG path data (spinner), font glyphs and
  split paths (`'lisp/' + name`); the reviewer found them. verify.sh's oxfmt gate only checks
  changed `ui/` files, so `bin/gen/*.mjs` slipped past it (CI checks all of lila/).
- Lessons: audit by directory, never by licence table; then grep for content (SVG path data,
  glyph names, split paths), not only file paths. Leave references inside modules a later unit
  deletes.
- Decisions: default sound set `sfx`; keep the AGPL `images/board` set incl. the horsey theme;
  delete unlicensed flairs rather than guess; logo drawn by LiGo (logs/decisions.md).
- Verified by Claude: lila compile, scalafmt, lila tests, ui lint/format/tests (verify.sh), UI
  build, screenshots. · Needs owner verification: the logo and favicon look; blind-mode users lose
  the `select` sound (no free set has one); horsey board theme's authorship.
- Follow-ups: manifest name/description (3.8); `ui/lib/package.json` still hashes
  `public/lifat/background/**` (empty glob; dropped with the chess-only bundles later).

### 2026-09-28 · 3.9 · Design: Go core types, game storage, round protocol, scalachess
- Did: ADR 0019. A read-only survey of the kept modules and `lila/app` counted scalachess use (about 245 files touch game-neutral types, about 200 chess rules/formats), read lila's game BSON, the round move flow and lila-ws's `Fens`/`ClientOut`, then decided: scalachess stays for neutral types and Glicko-2 only (a CI check in 3.17 bans chess rules/formats); a Go game sits beside the chess one until 3.17; `game5` keeps neutral keys plus `sz`/`ru`/`km`/`hc`/`ip`/`ac`; moves are an SGF point or `pass`; Fischer stays on `chess.Clock`, byo-yomi comes via go-rules in Phase 4. PLAN §3.4 step 5 reworded.
- Worked: lila already derives turn from ply parity with `startedAtPly`, so Go's "Black first, or White first with handicap 2–9" fits without a new turn field.
- Didn't work / dead ends: this session's first container had an old Setup script without PlayStrategy's Maven repo, so strategygames didn't resolve; re-running `dev/cloud-setup.sh` + `dev/ligo deps` fixed it (`dev/ligo test rules`: 252 passed). Its POM has no scalachess dependency and its jar has `strategygames.ByoyomiClock`. The reviewer found two gaps, fixed in the ADR: what two passes do before Phase 4's scoring phase exists (now: the game ends, no winner), and a claimed `dev/ligo db` reset that doesn't exist (Claude never wipes a database; old chess documents are ignored by query). Its other points (the clock-start recipe, runtime `turnColor`, the chess reader crashing on Go documents, chess's 600-ply forced draw, the bridge living in `core`) are written into the ADR for later units.
- Lessons: `scalachess-rating` needs `ByColor`, `Color`, `Outcome` and `IntRating` from scalachess core, nothing chess-specific; `Lilaism` exports `chess.Color`, so never wildcard-import `ligo.gorules.*` in lila.
- Decisions: ADR 0019, Claude's call under the owner's 2026-09-28 delegation (logs/decisions.md). Fallback: vendor the neutral types if Phase 4's "scored" status or byo-yomi can't live outside scalachess.
- Verified by Claude: the survey's key facts spot-checked (`Lilaism.scala` export, `GoGame.replay` private, `RoundSocket` `r/move` parsing, lila-ws `RoundMove`); `bash .claude/skills/verify/verify.sh` (see PR). · Needs owner verification: none.
- Follow-ups: 3.10 wires go-rules in; 3.12 adds public `GoGame.replay` to go-rules. The designated branch can't be force-pushed (guard-bash) after its PR is squash-merged: merge the old remote branch in and take our side, checking for conflict markers before committing.

### 2026-09-28 · Phase 3 breakdown · Split fork & de-chess into units
- Did: split PLAN §5's Phase 3 row into units 3.1–3.20 (asset strip; six removal units; rebrand leftovers; a design ADR for Go core types, the game schema and the round protocol; go-rules wiring; core, game, round, lila-ws, game creation and remaining-module migrations; dropping scalachess; round and lobby UI; the demo) and classified every lila module and `ui/` package in ADR 0018. Refreshed docs/STATUS.md.
- Worked: lila's `build.sbt` module graph gives a clean removal order (gathering only feeds tournaments; study feeds relay, practice and studySearch). The reviewer's scripted checks found every module in exactly one bucket and no removal unit deleting something a later one needs.
- Didn't work / dead ends: the first draft said scalachess could be dropped while keeping `scalachess-rating`; the reviewer found its POM depends on scalachess core and that kept modules use scalachess's game-neutral types (`ByColor`, `Centis`, `IntRating`, `PlayerTitle`). Unit 3.9 now decides scalachess's fate. It also found gaps in what units touch (`mod` reaching `game` only through `evaluation`, `ui/round` importing `voice`/`keyboardMove`, engine code in `ui/lib`, missing lila-ws actors), now in the table.
- Lessons: read the POM of any artifact a plan says "stays when X goes". "keep dormant" still costs a migration once scalachess goes, so the map keeps dormant only what a public demo would need (report, mod, appeal, shutup).
- Decisions: the split and the module map, Claude's calls under the owner's 2026-09-28 delegation (ADR 0018, logs/decisions.md).
- Verified by Claude: every module in `lila/modules` appears in exactly one bucket of ADR 0018 and every `lila/ui` package is listed (scripted check); `bash .claude/skills/verify/verify.sh` (see PR). · Needs owner verification: none; skim the units and ADR 0018's remove list if you like.
- Follow-ups: 3.1 starts next. Only 3.18–3.20 need Phase 2 (2.1, 2.3, 2.4).
### 2026-09-26 · unit 0.2 · Import upstream snapshots + baseline build — DONE (supersedes the "IN PROGRESS" entry below)
- Did:
  - Owner allowed the four blocked hosts. Built and ran the unmodified lila + lila-ws in a cloud
    session: `pnpm install --frozen-lockfile` (with the ab-stub workaround, ADR 0008) → `./ui/build`
    → `sbt compile` for both → Mongo 7.0.28 (Docker) + Redis → `./lila.sh run` + lila-ws `sbt run`.
  - Took desktop and phone screenshots (`docs/research/baseline/`).
  - Ran a 52-agent verification workflow: 6 independent verifiers, 2–3 skeptics per issue, and a
    completeness critic.
  - Fixed what it found: removed LFS attributes (ADR 0009); corrected COPYING (ADR 0007); recorded
    the cloud dependency sources (ADR 0008).
- Worked:
  - lila compile: 250 s, 87 units / 1,490 sources, 0 errors, 17 `[warn]` lines, all from upstream's
    `-Wunused:all` (10 unused `@nowarn`). Keep these as the baseline for later diffing.
  - lila-ws compile: 63 s, 85 sources, 0 errors (warnings: sbt lintUnused, duplicate `lila-maven`
    resolver name, 1 deprecation).
  - UI build: 22 s (esbuild, sass → 148 CSS files, tsc, i18n, manifest).
  - Running: `GET /` → 200 "lichess.dev • Free Online Chess". The lobby websocket to
    `ws://localhost:9664` opens and receives frames, no console errors, no reconnect banner, and the
    lila ⇄ lila-ws Redis link is up ("LILA BOOT", "LILA VERSIONING READY").
  - About 60 routes probed; only `/storm` returns 500 on an empty DB (upstream behaviour: no puzzles).
  - Import integrity: tree ids identical to upstream (lila `41d7ac5a…`, lila-ws `04bbd626…`),
    15,994 + 105 files, modes and symlinks equal.
  - The builds changed no tracked files; every output is gitignored.
- Didn't work / dead ends:
  - The 94 Git LFS pointer files under `lila/public/lifat` plus inherited `filter=lfs` made clones
    fail wherever git-lfs is installed (exit 128). Fixed by removing the attributes: exit 0 after,
    verified.
  - The imported snapshot contains non-free/NC upstream assets, contradicting COPYING. Fixed by
    documenting them and scheduling the strip as the first Phase 3 unit.
  - `lila/AGENTS.md` (upstream lichess contributor guide) is auto-loaded by Claude Code when reading
    files in `lila/`, because LiGo has no CLAUDE.md yet. Some of it conflicts with LiGo's rules
    ("trust these instructions", non-frozen `pnpm install`, `bin/deploy`). Treat it as upstream
    documentation; LiGo rules win. Unit 0.4's CLAUDE.md files fix it.
  - `main` protection currently blocks deletion and force-push only; "require a pull request"
    isn't enabled yet (owner action).
- Lessons: promoted to the Lessons section.
- Decisions: owner approved ADR 0007 (document + strip early), ADR 0008 (cloud dependency sources),
  ADR 0009 (remove LFS attributes), and moving the Linux-box check to the end of unit 0.3.
- Verified by Claude: all of the above, with real output (compile/UI/run logs, Playwright, tree-id
  comparison, 918/918 mirror artifacts matching Maven Central SHA-1s, the LFS clone before/after
  test).
- Needs owner verification: the baseline on your Linux box (after unit 0.3); a skim of the COPYING.md
  §1.1 wording (licensing is a judgement call).
- Follow-ups:
  - Unit 0.3 codifies ADR 0008 and gives you a one-command local run.
  - The first Phase 3 unit strips non-free assets (by directory, including inline logos, branded
    flair and Unsplash montages) and needs a free default sound set (your decision then).
  - Unit 0.4 adds the CLAUDE.md files, which neutralise `lila/AGENTS.md`.
  - The rebrand unit (0.7) repoints the AGPL §13 source links to LiGo's repo.
  - The "Li-" naming question gets checked before any public demo.
  - A second review pass (44 agents) found only documentation gaps, all fixed before the PR.

### 2026-09-26 · unit 0.2 · Import upstream snapshots + baseline build (IN PROGRESS, blocked)
- Did: imported lila @ b3f190be (2026-09-25) and lila-ws @ 24053fc0 (2026-09-22) as squashed snapshots via `git archive` (owner chose squashed over full history). Recorded SHAs in docs/UPSTREAM.md. Installed sbt 2.0.9 (official GitHub release tarball) and Node 24.20.0 (nodejs.org, checksum verified) + pnpm via corepack. Pulled mongo:7.0.28 from Docker Hub.
- Worked: the file lists match upstream exactly (lila 15,994 files, lila-ws 105). Node, pnpm, sbt launcher and the Mongo image all installed.
- Didn't work / dead ends:
  - `lila/public/data/bot/README.md` is tracked upstream despite lila's own `.gitignore` (`/public/data/*`); a plain `git add` skipped it and it had to be force-added. Lesson: after importing, always diff `git ls-files` against upstream.
  - Build blocked by the cloud network policy (403) on four hosts lila needs: `jitpack.io` (liplay sbt plugin, scalalib, scalachess — used by both lila and lila-ws), `repo.scala-sbt.org` (sbt plugin repo), `central.sonatype.com` (snapshot resolver) and `codeload.github.com` (the GitHub-hosted `ab-stub` npm package needed by `pnpm install`). Owner must add them to the environment's allowed domains.
  - Maven Central (`repo1.maven.org`, `repo.maven.apache.org`) randomly returns HTTP 429 to this environment (~1 in 6 requests). coursier's JVM launcher broke on it (a skipped jar left a conflicting classpath). Fix: Google's official Central mirror `maven-central.storage-download.googleapis.com/maven2` (0 × 429 in 30 requests) via `~/.config/coursier/mirror.properties` and `~/.sbt/repositories` + `-Dsbt.override.build.repos=true`. That file must also list lila's own resolvers (lila-maven on raw.githubusercontent.com, jitpack), or the override hides them.
- Lessons: promoted above.
- Decisions: squashed snapshot (owner, 2026-09-26). Waiting: network allowlist (owner action).
- Verified by Claude: file-list parity with upstream; Node checksum; tool versions. Not yet verified: compile, UI build, running server (blocked).
- Follow-ups: once hosts are allowed, run `pnpm install`, `./ui/build`, `sbt compile` (lila, lila-ws), start lila + lila-ws + Mongo + Redis, screenshot the homepage; then the owner repeats it on the Linux box. Bake the mirror config into dev/cloud-setup.sh in unit 0.3.
