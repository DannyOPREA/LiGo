# Tsumego log

## Lessons (curated, ≤ 30 lines — read this first)
- Modern tsumego books are copyrighted, and sanderland/tsumego is MIT for its code only. Public-domain classics are OK only as our own transcriptions from original sources, because the UK/EU database right can protect modern datasets (2026-09-25, planning research).

## Entries (newest first)

### 2026-10-04 · Unit 8.8 part two · The Phase 8 demo on the real stack
- Did: `lila/tests/e2e-demo/phase8-demo.spec.ts` at phone size on 3.20's real-stack harness. A new
  player signs up (a POST to /signup, since email confirmation is off in development), then plays the
  puzzles /training gives them: it solves one that ends in one move and fails the others, until there is
  one of each. Each result's rating change shows, and the rating carries on from the last result. Then
  all 240 committed puzzles come back from `/api/puzzle/:id` exactly as committed (size, bounds, stones,
  player, tree) with the source line `Puzzle.sourceLine` writes, and every 24th opens on the trainer
  page. It runs in the `e2e` workflow (nightly, on demand, on PRs labelled `e2e`) and in `dev/ligo e2e demo`.
- Worked: reading the shown puzzle's id from the page and its tree from the API, so the test plays
  whatever lila's selector picks.
- Didn't work / dead ends: the first version's review found four faults before CI ran it: `import.meta`
  in a CommonJS spec (Playwright then lists 0 tests and the Phase 3 demo fails with it), a signup POST
  without an Origin (lila answers 403), a puzzle opened by id (casual, so the rating doesn't move), and
  `/api/puzzle/many` for 240 ids (rate-limited to 300 credits an hour per IP).
- Lessons: lila's CSRF check wants `X-Requested-With: XMLHttpRequest` or the site's own Origin on a
  POST. A puzzle opened at /training/:id that the player hasn't played is casual. Playwright loads
  lila/tests specs as CommonJS: use `__dirname`, not `import.meta`.
- Decisions: play what /training serves rather than a puzzle by id, so the result is rated; fetch the
  240 puzzles one by one from `/api/puzzle/:id`, which has no rate limit.
- Verified by Claude: tsc, oxlint (type-aware), format, `playwright test --list` (both demos listed);
  the real-stack run is the PR's `e2e` job (lila doesn't run in the cloud session).
  · Needs owner verification: `dev/ligo e2e demo` on your box after `dev/ligo up`.
- Follow-ups: none for Phase 8.

### 2026-10-04 · Unit 8.8 · The Phase 8 demo (part one: on the built page)
- Did: `lila/ui/puzzle/e2e/demo.spec.ts` at phone size: a signed-in player taps and confirms, solves
  one puzzle and fails the next, and the rating goes up, then down; then all 240 committed puzzles open on
  the trainer page with their stones, goal and source line, in 8 tests of 30. It runs in the `ui` CI job's
  "Puzzle trainer" step. The owner's checklist is docs/demos/phase-8.md.
- Worked: the 240-puzzle walk takes about 15 s per 30 puzzles, so it fits in CI.
- Didn't work / dead ends: the stand-in server worked each rating change out from the starting rating, so
  a second result showed the wrong "before" rating (lila shows the new rating minus the change). It now
  carries the rating over from one result to the next, as the server does.
- Lessons: lila's puzzle side box shows `user.rating - ratingDiff` with the change, and takes the new rating
  from the `next` puzzle that comes with the result.
- Decisions: the demo runs now on the built page; the same walk against the real server waits for 3.20's
  full-stack browser tests (logs/decisions.md).
- Verified by Claude: UI build, tsc, lint, format, all 32 puzzle browser tests pass.
  · Needs owner verification: docs/demos/phase-8.md.
- Follow-ups: 8.8 part two, the walk on the real stack, after 3.20.

### 2026-10-04 · Unit 8.7 · The Go puzzle trainer page
- Did: `ui/puzzle` is a Go trainer on 8.5's `mountPuzzle`; goban's right and wrong events drive
  lila's flow (result, rating change, next puzzle, votes, session strip, replay). The source line
  sits under the board; "View the solution" replays the first right line through 7.2's
  `readTree`/`playFrom` into a move list and a stepper. Touch-confirm and the board theme come from
  the preferences. The controller's HTML actions are back (trainer, themes, daily, embed,
  dashboard, history, replay), replacing 3.16's placeholder. 12 unit tests (one replays the right
  line of all 240 puzzles), 12 behaviour tests and 10 screenshot tests at desktop and phone size,
  in `dev/ligo test pages` and the `ui` CI job.
- Worked: the board box follows the puzzle's `bounds`, so a corner puzzle fills a phone screen.
- Didn't work / dead ends: lila doesn't compile in the cloud, so CI is the Scala compile.
- Lessons: lila's `san` element sets moves in a chess font, so columns B, K, N, Q and R showed as
  chess pieces (the analysis board has the same issue). Playwright's `request.postData()` of an
  `xhr.form` body is multipart, not urlencoded.
- Decisions: hints dropped (goban marks no hint), a Confirm move button as on the game page, theme
  names sent by the server (logs/decisions.md, ADR 0025 amendment).
- Verified by Claude: UI build, lint, format, 255 unit tests, 22 Playwright tests, CI.
  · Needs owner verification: `/training`, `/training/themes`, `/training/dashboard/30`,
  `/training/history` on a computer and a phone; solve one, fail one, view a solution.
- Follow-ups: 8.8 (the demo); keyboard and screen-reader play for puzzles is not wired
  (`mountPuzzle` has no `access.ts`).

### 2026-10-03 · Unit 8.6 · Puzzles on the server
- Did: `lila/modules/puzzle` now stores and serves ADR 0025's Go puzzle (size, bounds, setup stones,
  player, goban's move tree kept as BSON, goal, provenance, glicko, plays, votes, Go themes). The
  JSON view sends goban's own puzzle fields, the shape `mountPuzzle` takes, plus id, rating, themes,
  goal and a one-line source. Selection, sessions, difficulty, the daily puzzle, rounds, the puzzle
  Glicko-2, votes, reports, dashboard, history, replay and activity are kept. New:
  `PuzzlePathBuilder` (the `puzzle2_path` build lichess ran outside lila) and a job that rebuilds
  the paths shortly after boot, then whenever they are a day old or the puzzle count changed.
  `dev/ligo puzzles load` (a mongosh script, both modes) upserts the 240 puzzles, and `dev/ligo up`
  runs it on an empty database. Removed: PuzzleBatch, PuzzleOpening, PuzzleTagger, GameJson, the GIF
  thumbnail, of-player, openings, colour choice and the mobile routes (ADR 0025 §3).
- Worked: the loader against a real Mongo (240 new, then 0 changed on a second run); the pure Scala
  (path builder, BSON reader, JSON view) in a scratch Scala 3 harness, 26 tests.
- Didn't work / dead ends: lila doesn't compile in the cloud (strategygames isn't in this
  container's sbt repositories), so CI is the first full compile of the rest.
- Lessons: mongosh writes a whole number as an int; lila's reader takes it either way, but the
  loader writes ratings and votes with `Double()` to match what lila writes. Path ids carry their
  generation and band index, so a rebuild inserts the new paths before deleting the old and
  selection never sees an empty collection; the review caught that bands sharing a rating (52
  puzzles sit at 2150) gave two paths one id. Test builders on the real data's distribution.
- Decisions: band size 25, tiers by vote, theme votes kept on rounds only, loader leaves paths to
  lila (logs/decisions.md, ADR 0025 amendment).
- Verified by Claude: loader run against Mongo 7, tools/puzzles tests, CI on the PR (the first
  full Scala compile). · Needs owner verification:
  `dev/ligo puzzles load` and `/api/puzzle/daily` on your box.
- Follow-ups: 8.7 (the trainer page on `mountPuzzle`).

### 2026-09-30 · Unit 8.4 · The first puzzle set: 240 generated life-and-death puzzles
- Did: ran `puzzles build --seed 1 --count 240` with KataGo (g170 test network, 400 visits) into
  `tools/puzzles/data/generated-001.json`; wrote the sources list `tools/puzzles/data/SOURCES.md`
  and COPYING.md §2's line for the set; reviewed a sample by eye.
- Worked: the pipeline ran unchanged; KataGo disagreed on 8 of 248 finished puzzles.
- The set: 240 puzzles, 113 to live and 127 to kill, 150 in the centre, 62 on an edge, 28 in a
  corner, 17 shapes (crossed five 51, rabbity six 44, bulky five 34, straight four 24, pyramid
  four 23, the rest fewer). Bands: 62 at 800, 69 at 1200, 48 at 1600, 61 at 2000. The longest
  line is 1 move in 175 puzzles (the move and a refutation), 3 in 19, 5 in 31, 7 in 15. 208 have
  one right first move, 15 two, 17 three.
- Run: 2,365 positions tried in about 12 minutes; 1,505 rejected as a defender in pieces, 31 with
  no liberties, 17 duplicates, 460
  settled whoever moves, 57 ko or over budget, 39 ko lines dropped from trees, 6 too easy
  (4 or more right first moves), 2 trees over 300 nodes, 8 where KataGo disagreed. Slowest
  position 13 s.
- Hand review (10 puzzles, including three with 7-move lines): the vital points of the crossed five,
  bulky five and L five, the corner square four and the rabbity six are the textbook answers; the
  7-ply lines are the defender filling its own eye space and the attacker answering, right but
  long. All 240 pass `puzzles check`. Unit 8.5's Chromium test (in its PR, not this one) replayed
  a right line and a wrong first move of every puzzle in goban's puzzle mode against this file.
- Didn't work / caveats: 52 puzzles sit at exactly 2150 and 10 at 650, where the difficulty score
  runs past the band's ends; lila's puzzle ratings move with play, so this is left. The set leans
  to centre shapes, because the centre layouts pass the wall check most often.
- Review (independent): no blocking findings. An independent life-and-death solver (no
  goban-engine) agreed with every right and wrong leaf of all 240; 11 more hand-checked. Noted, not
  changed: a rerun of seed 1 changed 4 of 240 puzzles (KataGo's verdict and the solver's time
  limit aren't repeatable), now said in SOURCES.md; rVMPv and MrhV0 are one crossed five rotated
  with colours swapped (the duplicate check compares colours as given); some one-move shapes sit at
  2150 because depth counts the defender's filler replies (fCm7R, AqRMx), for 8.6's rating work.
- Lessons: most candidates die at the one-group check (64 %), so a bigger set needs more
  variations that keep the ring whole, not a longer run. "Same seed, same puzzles" holds only
  while KataGo and a time budget don't decide what is kept; commit the file, don't regenerate it.
- Decisions: set size, one file per batch, bands unchanged, classics tail later
  (logs/decisions.md; Claude, under the owner's 2026-09-28 delegation).
- Verified by Claude: `puzzles check` (240 pass), the Chromium replay of every puzzle, `dev/ligo
  test puzzles`, verify.sh. · Needs owner verification: none; optionally re-check the set with
  the b18 network on your box.
- Follow-ups: 8.5 (the puzzle board), the *Gokyō Shumyō* tail when a scan is reachable.

### 2026-09-30 · Unit 8.3 · tools/puzzles: generator, solver, checker and pipeline
- Did: finished 8.3 from the stopped branch. Added a known multi-move answer (a rabbity six the
  attacker kills at the vital point, the defender's three replies each answered), completed ADR
  0025's amendment (bands from the sample's quartiles, KataGo checks every first move, wrong moves
  in the solver's order) and the decisions lines. Everything else is in the stopped entry below.
- Worked: the rabbity six test passed as the textbook answer on the first run; 33 tests pass with a
  real KataGo; the feasibility gate passed (250 of 265 settled, 46 s).
- Didn't work / dead ends: pnpm 12 `workspace:*` links from tools/puzzles (see the stopped entry).
- Lessons: check a generator by a histogram of its real output, not only hand cases (the review
  caught every puzzle ending after one move); a detached defender stone makes "lose any stone" the
  goal, so the wall check requires one group.
- Decisions: ADR 0025's amendment and the ajv dependency, Claude's calls under the owner's
  2026-09-28 delegation (logs/decisions.md).
- Verified by Claude: typecheck, lint, 33 tests with KataGo, `dev/tests/run.sh`, verify.sh (all
  gates but go-rules, whose strategygames download the cloud proxy blocks; CI runs it). Reviewer:
  2 blocking (the settled test; no log or decisions lines), both fixed; non-blocking fixed: the
  bent-four shape, KataGo's ownership side pinned per query, the verify trigger on lila's lockfile,
  a CLI crash on a null entry; noted in the ADR: KataGo checks first moves only, the wrong-move
  order. Not changed: repeated solves in generate() (performance only).
  · Needs owner verification: add the `puzzles` check to main's required checks.
- Follow-ups: 8.4 (the first 200+ puzzles), 8.5 (goban's puzzle mode in libs/board).

### 2026-09-29 · Unit 8.3 (in progress, stopped) · tools/puzzles pipeline
- Did: built `tools/puzzles` (catalogue, wall check, exact solver with Benson and a ko cut-off,
  puzzle tree, difficulty, KaTrain frame port, KataGo second opinion via services/scoring's new
  `analyse`, schema + `check`, SGF out and classics import, feasibility gate, CLI), `dev/ligo
  puzzles` / `test puzzles`, a verify gate, a `puzzles` CI workflow, docker mounts, notices, and an
  ADR 0025 amendment. 32 tests pass; the gate passed (250 of 265 settled in 46 s, seed 1).
- Worked: the frame port matches KaTrain's Python exactly on 6 boards; the solver gives textbook
  answers on every shape the reviewer probed.
- Didn't work / dead ends: `workspace:*` links from tools/puzzles to services/scoring and libs/board
  pointed at the wrong directory under pnpm 12, so both are imported by path.
- Lessons: check a generator by a histogram of its real output, not only hand cases: the reviewer
  found every puzzle 1 ply deep because the "settled" test let the opponent pass instead of moving
  twice (fixed; 16 of 60 now go 3 to 7 plies). Defender stones in two groups made KataGo disagree;
  the wall check now requires one group.
- Decisions: none new beyond ADR 0025's amendment (to be added to logs/decisions.md with the PR,
  plus the ajv dependency).
- Verified by Claude: typecheck, lint, tests (with real KataGo), `dev/tests/run.sh` 56/56,
  verify.sh (all gates but go-rules, blocked by the cloud proxy). Reviewer: 2 blocking (settled
  test, missing log/decisions lines), the first fixed.
- Follow-ups (on resume): a multi-move known-answer test; re-check the ADR amendment's wording
  (settled rule, bands, KataGo checks first moves only, wrong-move order); decisions lines; the PR;
  then 8.4. WIP is on branch `claude/phase-8-units-eujcc2`, no PR.

### 2026-09-29 · Unit 8.2 · ADR 0025: puzzle format, generator, trainer, puzzle rating
- Did: finished ADR 0025 from the stopped draft: goban's own `PuzzleConfig` (OGS's puzzle JSON)
  plus provenance as the format, goban's puzzle mode as the browser's checker, the generator's
  design with the reuse memo docs/build-vs-buy/tsumego-generator.md (KaTrain's MIT frame ported,
  `services/scoring`'s KataGo client reused, solver our own), lila's trainer parts kept and
  removed, the puzzle rating as a number, `dev/ligo puzzles load`. PLAN rows 8.2, 8.3 and 8.5
  updated (8.5 no longer needs 7.2).
- Worked: the spike in tools/puzzles/spike/ (see the stopped entry below) set the region limit.
- Didn't work / dead ends: none.
- Lessons: goban's puzzle mode picks the opponent's reply at random among a node's branches, so a
  puzzle tree may only list equally good replies.
- Decisions: ADR 0025, Claude's call under the owner's 2026-09-28 delegation (logs/decisions.md).
  The KataGo network licence (PR #50) settles ADR 0024 §7: the cloud checks with the g170 test
  network, and the owner may re-check on the b18.
- Verified by Claude: verify.sh (no gates apply to docs or `tools/puzzles` yet); the spike re-run
  by the reviewer (28,596 moves a second; straight three right; 161,172 nodes in 30 s). Reviewer: 2
  blocking (the spike had no budget or catalogue sample; ko and the superko-unsafe table
  undefined), fixed by moving the gate into 8.3 with a 20 s budget and a stop rule, and by leaving
  ko out of the generated set with a sound table key. Non-blocking fixed: goban's puzzle mode
  needs the play setting, automatic opponent moves and our own touch-confirm glue; `bounds` is a
  board setting; the wall-safety check; every winning move listed; lila leftovers (of-player,
  mobile routes, tagger, a daily path build in 8.6); band ratings; the g170 licence basis; row 8.7
  needs 7.2. · Needs owner verification: the puzzle rating shown as a number, not kyu/dan (ADR 0025
  §4).
- Follow-ups: 8.3 (the generator and pipeline).

### 2026-09-29 · Unit 8.2 (in progress, stopped) · Puzzle format and generator design
- Did: drafted ADR 0025 (Proposed): OGS/goban's own puzzle JSON (`PuzzleConfig`, `move_tree` with
  `correct_answer`/`wrong_answer`) as LiGo's format, goban's built-in puzzle mode as the checker,
  lila's rated trainer kept, the puzzle rating as a number. reuse-scout wrote
  docs/build-vs-buy/tsumego-generator.md: no licensed solver or generator exists; port KaTrain's
  MIT tsumego frame, reuse services/scoring's KataGo client, write the solver.
- Worked: spike (tools/puzzles/spike/): goban-engine does about 20,000 place-and-undo per second on
  19×19; the straight three in the corner is solved correctly in under 10 ms; a 12-point eye space
  took 40 s unoptimised (161,000 nodes).
- Didn't work / dead ends: none yet.
- Lessons: goban already has a puzzle mode (OGS's puzzle pages) that follows a move tree, plays
  the opponent's reply and emits right/wrong events, so unit 8.5 is configuration, not a controller.
- Decisions: none final; the ADR is Proposed.
- Verified by Claude: the spike's output above. · Needs owner verification: nothing yet.
- Follow-ups: stopped at the owner's "Stop there for now" (2026-09-29 12:51Z). Next: finish ADR 0025
  with the memo's findings and the spike, update PLAN rows 8.3 and 8.5, review, PR.

### 2026-09-29 · Unit 8.1 · Tsumego content memo and ADR 0024
- Did: docs/build-vs-buy/tsumego-content.md (reuse-scout) checked every tsumego source's licence;
  ADR 0024 takes its option D: puzzles generated by LiGo (eye-shape catalogue, exhaustive local
  search over goban-engine, KataGo second opinion) plus a small *Gokyō Shumyō* tail later. PLAN
  rows 8.3 and 8.4 now say "generator" instead of "readers for existing collections".
- Worked: OGS's terms of service are readable from its GitHub repo (`src/views/docs/legal.tsx`);
  shallow clones settled the sanderland, tasuki, tsumego-hero and gogameguru licences.
- Didn't work / dead ends: most hosts (OGS site, goproblems, Sensei's Library, Wikimedia,
  katagotraining.org, NDL, arXiv) are blocked from the cloud, so claims about them are UNCHECKED.
- Lessons: no CC0 or CC-BY tsumego dataset turned up; the one big well-licensed set,
  gogameguru/go-problems, is CC BY-NC-SA, which our rule rejects; the classics are dan-level and
  positions-only, so a kyu base has to be generated.
- Decisions: option D, Claude's call under the owner's 2026-09-28 delegation (logs/decisions.md);
  runner-up gogameguru, only if the owner rewrites the non-commercial rule.
- Verified by Claude: verify.sh; every licence quote in the memo has its source URL. Reviewer: 2
  blocking (no reuse survey behind the custom generator, e.g. KaTrain's MIT tsumego frame; puzzle
  files made CC0 against ADR 0007), both fixed (a code reuse check and spike in 8.2; files MIT), plus
  stale PLAN §3.1/§10 rows, 8.3/8.4 wording and the network licence gate, all fixed.
  · Needs owner verification: the memo's six owner points, chiefly whether to keep the
  non-commercial rule.
- Follow-ups: 8.2 (design ADR: the puzzle format and the generator's shape).

### 2026-09-29 · Phase 8 breakdown · Tsumego split into units 8.1–8.8
- Did: split Phase 8 into 8 units (docs/PLAN.md §5, "Phase 8 units"): a content memo with a licence
  check (8.1), a design ADR (8.2), the `tools/puzzles` import pipeline (8.3), the first ≥ 200
  puzzles (8.4), puzzle solving in `libs/board` (8.5), then the lila halves: the puzzle module on
  the server (8.6), the trainer page (8.7) and the demo (8.8).
- Worked: lila's `puzzle` module and `ui/puzzle` are kept (ADR 0018), so the lila units adapt them;
  the content, the pipeline and the solving logic live outside lila, so they can be built before
  the fork.
- Didn't work / dead ends: none.
- Lessons: lila's `Puzzle` is one forced line (`fen` + `line` of UCI moves) with the opponent's
  first move played for you; a tsumego has several right answers and refutations, so the stored
  puzzle and the browser's checker both need a tree, not a line.
- Decisions: the split itself, Claude's call under the owner's 2026-09-28 delegation
  (logs/decisions.md).
- Verified by Claude: verify.sh. · Needs owner verification: whether the split reads right.
- Follow-ups: 8.1 next, then 8.2 to 8.5.
