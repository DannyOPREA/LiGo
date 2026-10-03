# 0025. Phase 8: the puzzle format, the generator, the trainer and the puzzle rating
- Status: Accepted
- Date: 2026-09-29
- Decided by: Claude, under the owner's 2026-09-28 delegation ("Don't ask for my approval for
  anything, just work until I tell you to stop")

## Context
Phase 8 (docs/PLAN.md §5, units 8.1–8.8) adds a tsumego trainer (§3.8 item 6). The content is
[ADR 0024](0024-tsumego-content-generated-plus-classics.md): puzzles LiGo generates and checks
itself, plus a small *Gokyō Shumyō* tail. ADR 0018 keeps lila's `puzzle` module and `ui/puzzle`
(without storm, racer and streak, removed in 3.4); ADR 0021 keeps the puzzle perf apart from the
`go` perf; the browser's board and rules are OGS goban ([ADR 0014](0014-ogs-goban-for-client-rules-and-board.md)).
Decided here: what a puzzle is on disk, in Mongo and in the browser; how the generator makes and
checks one; which parts of lila's trainer stay; the puzzle rating; how puzzles reach Mongo.

What lila and goban have today (read for this ADR; paths under `lila/` and goban 8.3.226):
- lila's `Puzzle` (`modules/puzzle/src/main/Puzzle.scala`) is one forced chess line: `fen`, `line`
  (UCI moves; the first one is the opponent's, played for you), `glicko`, `plays`, `vote`, `themes`
  and the `gameId` it was cut from. The browser's `moveTest.ts` compares each move with
  `solution[i]` and accepts any checkmate. Puzzles are picked through `puzzle2_path` documents
  (`PuzzlePath.scala`): each holds a batch of puzzle ids for one theme ("angle"), tier and rating
  band. lichess builds them with a script outside lila, so LiGo needs its own. The trainer also has
  the daily puzzle, `PuzzleAnon` for guests, the dashboard, history, replay, theme votes, reports
  and PuzzleBatch (offline batches for the mobile app).
- goban's board already has a **puzzle mode**, which OGS's own puzzle pages use. It is
  `mode: "puzzle"` with a `PuzzleConfig`: `width`, `height`, `initial_state` (`{black, white}` as
  concatenated SGF points), `initial_player`, `move_tree` (a `MoveTreeJson`: `x`, `y`, `branches`,
  `text`, `correct_answer`, `wrong_answer`),
  `puzzle_player_move_mode` (`"free"` or `"fixed"`) and `puzzle_opponent_move_mode`
  (`"automatic"` or `"manual"`). When the player plays, goban follows the tree. If the move is not
  in the tree, or reaches a `wrong_answer` node, it emits `puzzle-wrong-answer`. If it reaches a
  `correct_answer` node, it emits `puzzle-correct-answer`. Otherwise it plays one of the
  opponent's branches at random, and it follows the same shape reached by another move order
  ("isobranches") when a node has no branches. This is the checker 8.5 needs, already written.
  It is not switched on in our `mountBoard`, which is play-mode only (`libs/board/src/board.ts`).
  Three things need glue:
  - goban checks a tap against the tree only when the host's `getPuzzlePlacementSetting()` returns
    `{mode: "play"}` (the default, "place", emits no right or wrong events);
  - `puzzle_opponent_move_mode` defaults to "manual" and must be set to "automatic";
  - in puzzle mode a tap places the stone at once, ignoring goban's submit settings, so
    touch-confirm (unit 2.3) is `libs/board`'s own glue.

  The board's `bounds` (the part of the board to show) is a board setting (`GobanConfig`), not
  part of `PuzzleConfig`. Puzzle mode plays without a superko check, which is harmless: any move off
  the tree is wrong anyway.

## Decision

### 1. A puzzle is OGS's puzzle JSON plus LiGo's fields
- **The format is goban's `PuzzleConfig`**, which OGS's own puzzles are also built on, so goban plays it with
  no translation. LiGo adds `bounds`, `id`, `goal`, `themes`, `rating` (the starting rating) and
  `provenance` beside it. Whether OGS could import the set without conversion is not checked. The JSON schema lives in
  `tools/puzzles/schema/puzzle.schema.json`, and the browser, the server and the tools all check
  against it.
- **The board**: 9×9, 13×13 or 19×19 (`width` = `height`), with `bounds` cropping it to the corner,
  edge or area the puzzle is about, so a corner problem fills a phone screen. Setup stones only;
  no moves before the puzzle starts (lila's "opponent's first move" is dropped).
- **The tree** alternates the player's and the opponent's moves.
  - A line of right play ends on a player's node marked `correct_answer`. A refutation line ends
    on a node marked `wrong_answer`.
  - At every player node the tree lists **every** winning move, each with its own subtree. goban
    marks any move that isn't in the tree as wrong, so leaving out a winning move would mark it
    wrong.
  - Every opponent node is a reply the solver judged best: the longest resistance. goban picks among
    them at random, so the tree lists only equally good replies.
  - Passes never appear as moves. A line stops at the player's last move when the result holds
    from there without further play (see §2, "where a line ends").
- **Goals**: `live` and `kill`, which the generator makes. Seki counts as living. The schema also
  has `ko`, `capture` (win the capturing race) and `connect` for the hand-transcribed classics
  and for later; the generator doesn't make them (§2).
- **Text**: a node's `text` is short English for now. The trainer's own labels go through lila's
  i18n.
- **Themes** replace lila's chess themes with Go ones: `lifeAndDeath`, `living`, `killing`, `ko`,
  `capturingRace`, `tesuji`, `eyeShape`, `snapback`, `throwIn`, `corner`, `edge`, `centre`, plus
  lila's `mix`. The generator sets them, and players' theme votes can add or remove them as in lila.
- **Provenance** is required on every puzzle, with the fields listed in ADR 0024 §3. The trainer
  shows a one-line source under the board: "Generated by LiGo (seed 1234)" or "Gokyō Shumyō (1812),
  living section, problem 12".
- **SGF out**: `tools/puzzles` can write any puzzle as SGF (setup stones, `PL`, the tree, with
  "RIGHT" and "WRONG" in the comments, goproblems' convention) so it opens in Sabaki. The JSON is
  the source of truth.

### 2. The generator and checker in `tools/puzzles`
- **Reuse check first** (ADR 0024 §5): [the generator memo](../build-vs-buy/tsumego-generator.md)
  found no licensed tsumego solver or generator to reuse. The only candidates are in Rust and have
  no licence. So:
  - the frame is ported from KaTrain's MIT `tsumego_frame.py` (see below);
  - the KataGo client is `services/scoring`'s `KataGoClient`, gaining a public `analyse` method;
  - the catalogue, the solver and the difficulty estimate are LiGo's own code (about 700 to 900
    lines, rung 6).
- **A TypeScript package in lila's pnpm workspace**, beside `services/scoring`, using
  goban-engine (pinned to `libs/board`'s version) for every rule. Code and puzzle files are MIT, as
  everything under `tools/` is (ADR 0007, ADR 0024).
- **Positions**: a catalogue of eye-space shapes for the side that must live or die (straight
  three, bent three, bulky five, rabbity six, the L-group, the carpenter's square, corner shapes
  and so on) in the corner, on the edge and in the centre. The attacker's wall around them is made
  solid, and each shape gets variations: an extra liberty, a missing wall stone, a cutting point,
  a stone inside. Randomness comes from a seed that is stored in the provenance, so a run can be
  repeated.
- **The wall must really be safe.** The solver treats the outer wall as alive and searches only
  inside the region. So the generator keeps a position only if:
  - every attacker chain touching the region has at least 3 liberties outside it;
  - the defender has no liberty outside the region, so it can't escape.
  Variations that would break this (a missing wall stone, a cutting point) are dropped, not
  misjudged.
- **The solver** plays both sides inside the region only (at most 10 empty points to start; see
  the feasibility gate). It uses goban-engine's checked play and allows a pass for either side.
  It searches depth-first with alpha-beta and a transposition table, trying eye-shape vital
  points first. A line ends:
  - when the defender is captured;
  - when the defender is unconditionally alive (Benson's test, on the part of the board the
    defender encloses);
  - when both sides pass in a row, which means the defender survived: alive, or in seki.
  Seki needs no test of its own: the attacker's best move there is to pass.
- **Ko is left out of the generated set.** A search confined to the region has no ko threats, so
  it can't say who wins a ko. And under LiGo's situational superko (spec R-KO-1, R-KO-5) a result
  can depend on the history, which a transposition table keyed on the position alone doesn't see.
  So:
  - the table key is the region's points, the simple-ko point and whose turn it is;
  - a position is dropped as soon as any line the result depends on captures a single stone that
    could be taken straight back (a ko);
  - a line that reaches the depth limit is "unknown", never stored as a win, and makes the
    position be dropped;
  - superko cycles longer than a simple ko are then impossible within the kept lines, so the
    table is sound for what is kept.
  Ko puzzles wait for the classics tail or a later unit with an explicit ko model (for example,
  solving twice, once with each side winning every ko).
- **Where a line ends in the tree.** After the player's move, the line ends there (and that node is
  `correct_answer`) when the rest follows by force:
  - the defender is captured, or unconditionally alive;
  - or the solver's best reply for the opponent is to pass.
  Otherwise the opponent's best replies follow, then every winning player answer.
- **Kept puzzles**:
  - have at most 3 right first moves, or the puzzle is too easy;
  - are unsettled: the side to move wins, and the other side would win if it moved first;
  - have refutations in the tree for up to the 6 most plausible wrong first moves, ranked by the
    solver (any other wrong move is wrong anyway, since it is off the tree);
  - have trees at most 15 plies deep and 300 nodes in all.
- **KataGo's second opinion**: the puzzle goes on a full board with a tsumego frame. The frame is
  ported from KaTrain's MIT `tsumego_frame.py`, which lizgoban's author contributed there; it
  carries a credit line, and lizgoban's GPL source is not read. KataGo is then asked, with
  `allowMoves` keeping both sides in the region, whether each right answer reaches the goal and
  each refutation fails. A disagreement drops the puzzle and logs it.
- **The KataGo network**: the committed set is checked in the cloud with the pinned test network
  (`g170-b6c96`, from KataGo's own repository). The owner's full-size b18 network is under the
  KataGo Neural Network License, MIT-style (PR #50), so re-checking the set on his machine is
  allowed. Each puzzle records the network's name and sha256 (ADR 0024 §7). The test network is
  weak, so the exact search is what the set is trusted on.
- **Licence basis for the test network**: the g170 file ships inside KataGo's own repository,
  which is MIT (dev/katago.sh pins it from there). The claim that g170 networks are CC0 is
  unchecked and isn't relied on. The check stores only pass or fail and the network's name and
  sha256, nothing derived from the network.
- **Spike and feasibility gate.** The spike (`tools/puzzles/spike/`, 2026-09-29) was a plain
  search: no move ordering, no Benson, and a table that ignores history. It is kept for its
  speed numbers only:
  - goban-engine places and takes back 20,000 to 29,000 moves a second on 19×19;
  - it solved the straight three in the corner correctly (the middle point wins for either side)
    in under 10 ms;
  - it took 30 to 40 s (161,000 nodes) to prove a trivially alive 12-point space alive.

  That doesn't prove the real solver fast enough, so **the gate moves into 8.3**, with a budget.
  The solver (with move ordering, Benson's cut-off and the table above) must settle each catalogue
  position within 20 s on the cloud's CPU. A position that hits the limit is dropped. If fewer
  than 250 catalogue positions pass the gate, the budget and the region limit are revisited once.
  If that still falls short, Claude stops and brings back the ADR 0024 §6 choice.
  `@sabaki/go-board` (MIT) is kept in reserve for speed; it would be a new dependency, with its
  own record.
- **Difficulty** is measured, not guessed. It combines the length of the right line, how many
  first moves look plausible (liberties, eye points, vital points), and how many wrong tries need
  deep refutations. That gives a band, with a starting puzzle rating spread ±150 within it by the
  measured difficulty:
  - beginner: 800;
  - easy: 1200;
  - intermediate: 1600;
  - hard: 2000.
  These are lila's puzzle scale, not ranks. The kyu words used in teaching ("for 20k") stay out
  of the data. The set aims at 50 or more puzzles per band except the hardest, which the classics
  tail fills.

### 3. The trainer keeps lila's rated trainer, minus what needs a game
- **Kept**:
  - the rated trainer (`/training`, next puzzle by the player's rating and theme through
    `puzzle2_path`, with the player's easier/harder setting, `PuzzleDifficulty`, including
    `isExtreme`);
  - themes (`/training/themes`);
  - the daily puzzle and its embed (`/training/frame`);
  - the dashboard and history;
  - replay of failed puzzles;
  - theme votes, up and down votes;
  - guests through `PuzzleAnon`;
  - the game-neutral `/api/puzzle/*` routes (daily, one puzzle, next, activity, dashboard,
    replay).
- **Removed**:
  - chess themes and the openings angle;
  - the "from game" link and `/training/of-player` (a generated puzzle has no game; `gameId`
    goes from the document);
  - `PuzzleBatch` with `/api/puzzle/batch` and the old mobile-app routes (`mobileBc*`:
    `/training/batch`, `/training/new` and the numeric-id load, vote and round routes), since
    LiGo has no mobile app;
  - the puzzle GIF export;
  - `dubiousPuzzle` (compares the puzzle rating with the chess Standard rating);
  - `PuzzleTagger`'s daily `addAllMissing`, which tags chess phases (the generator sets themes).
- **Paths stay fresh.** lichess rebuilds `puzzle2_path` outside lila, and lila logs an error
  when the paths are more than a day old (`PuzzlePathApi.isStale`). Unit 8.6 ports the path
  build into the puzzle module as a daily job, so the rating bands follow the puzzles' ratings.
  `dev/ligo puzzles load` calls the same build.
- **The page**: `ui/puzzle` keeps its layout (the board, the side panel with the rating, "Your
  turn", the result, next, retry and view solution, the theme list), with `mountBoard` in
  goban's puzzle mode in place of chessground. `moveTest.ts` goes: goban's
  `puzzle-correct-answer` and `puzzle-wrong-answer` events decide the result. "View the solution"
  shows the tree in lila's tree view, fed by 7.2's `GoNode` replay of the puzzle's main right
  line. Touch-confirm (2.3) applies through `libs/board`'s own glue (§ Context).

### 4. The puzzle rating is lila's puzzle perf, shown as a number
- lila's puzzle Glicko-2 stays as it is, for players and for puzzles (`PuzzleFinisher`), in the
  puzzle perf, apart from the `go` perf (ADR 0021). A puzzle's starting rating comes from its
  difficulty band (§2).
- **It is shown as a number, not as kyu/dan**: a puzzle rating is not a playing strength, and
  showing "5k" for puzzles next to a different "5k" for games would mislead. The dashboard shows it
  as lila does.
- A new player's puzzle rating starts at lila's default (1500). This is not tied to the rank they
  declare at signup, and the first few puzzles move it quickly, as lila's does.

### 5. How puzzles reach Mongo
- **The set is committed** as JSON in `tools/puzzles/data/` (one file per batch), MIT. Any size
  limit is set in 8.4.
- **`dev/ligo puzzles load`** (a Node script in `tools/puzzles`) checks each puzzle against the
  schema and writes it into lila's puzzle collection (upsert by `id`, keeping a puzzle's played
  rating and votes). It then builds the `puzzle2_path` documents the way lichess's script does:
  batches per theme, tier and rating band (the same build as 8.6's daily job). `dev/ligo up` runs
  it on an empty database, so the local site always has puzzles.
- **The Mongo document** holds `_id` (5 characters, as lila's), `size`, `bounds`, `setup`
  (`initial_state`), `player`, `tree` (the `MoveTreeJson` as a BSON subdocument), `goal`,
  `themes`, `prov` (provenance), `glicko`, `plays` and `vote`. lila's server doesn't read the tree:
  it sends it to the browser with the puzzle. The server only checks the puzzle's result as lila
  does today (the browser reports win or loss, and lila rates it).

## Consequences
- Unit 8.5 changes: instead of "a trainer controller over 7.2's tree", it wraps goban's puzzle mode
  behind `mountBoard`. That means a `puzzle` option, the play setting, automatic opponent moves,
  the two result events and touch-confirm glue, with tests replaying every puzzle's right and
  wrong lines in Chromium. 8.5 no longer needs 7.2; 8.7's "view the solution" does. PLAN §3.1
  and §5 (rows 8.2 to 8.5 and 8.7) are updated to match.
- The generated set has no ko puzzles. ADR 0024 §1 said the tree marks ko; generated puzzles
  containing a ko are dropped instead (§2), and PLAN row 8.4 says "life-and-death".
- `services/scoring` gains one public method (`analyse`) used by `tools/puzzles`. Nothing else in
  the service changes.
- The server trusts the browser's win or loss, as lila does. Cheating a puzzle rating is possible,
  as it is on lichess; it is not worth more for a local proof of concept.
- goban's random choice among opponent branches means a player can see different replies on a
  retry. That is intended.
- The set is in OGS goban's own puzzle format, and the generator can go to OGS with it. Whether
  OGS's puzzle import takes it without conversion is unchecked.
- The generator's quality (varied, sensible puzzles) is the main risk. 8.3's tests pin known
  answers (for example, a straight three in the corner dies if the attacker plays the middle
  point), and 8.4 reviews a sample by eye before the set is committed.

## Amendments

### 2026-10-03, unit 8.6 (as built)
Claude's calls under the owner's 2026-09-28 delegation (logs/decisions.md):
- **The loader doesn't build paths.** `dev/ligo puzzles load` is a mongosh script (no Mongo driver
  in `tools/puzzles`, and docker mode needs no host Node). lila's puzzle module builds
  `puzzle2_path` shortly after boot and rebuilds it when the paths are a day old or the number of
  puzzles changed, so a load shows up within minutes without the loader calling the build.
- **Bands of 25 puzzles** (lichess's hold thousands), tiers top/good/all by the puzzle's vote.
- **Theme votes stay on rounds.** lichess folds them into a puzzle's themes with a job outside lila;
  that job isn't ported yet, so themes are the generator's for now.

### 2026-09-29, unit 8.3 (as built)
Building the generator made these points of §2 concrete. Claude's calls under the owner's
2026-09-28 delegation (logs/decisions.md):
- **The table key** is the region's points, the number of passes in a row and the side to move. No
  simple-ko point is needed: a move that captures one stone in a ko shape is cut off as unknown
  before it is played on, so no kept line has a ko point.
- **Where a line ends**: after the player's move, the line ends (`correct_answer`) when the
  opponent can't change the result even by playing two moves in a row. This is the concrete test
  behind "the solver's best reply for the opponent is to pass".
- **The budget** of 20 s a position is 10 s for each side to move (a position is solved twice).
- **The wall check also requires one group**: the defender's stones outside the region must be a
  single chain. Otherwise "lose any stone" would be the goal, and KataGo rightly disagreed on
  puzzles where the attacker only captured a detached stone.
- **Difficulty bands are calibrated on the generated set.** In a sample of 60 (seed 1), 44 puzzles
  are one move and 16 take 3 to 7 plies, so the band edges sit at the sample's quartiles of the
  measured score (`BAND_EDGES` in `tools/puzzles/src/generate.ts`); lila's puzzle Glicko moves
  each rating as people play.
- **KataGo checks each first move**: every right first move, and every wrong first move with its
  refutation. The later moves of a right line rest on the exact search alone.
- **"The 6 most plausible wrong first moves"** are the first 6 in the solver's move order (points
  with the most empty neighbours and chains short of liberties first), not a separate ranking.
- **Validation uses ajv** (MIT, already in lila's lockfile) against `schema/puzzle.schema.json`,
  and `tools/puzzles` imports `services/scoring`'s KataGo client and `libs/board`'s SGF reader by
  path rather than as workspace packages (pnpm 12 linked those to the wrong directory).

The feasibility gate passed: with seed 1, 250 of 265 catalogue positions were settled within the
budget (14 rest on a ko, 1 ran over), in 46 s on the cloud's CPU.

