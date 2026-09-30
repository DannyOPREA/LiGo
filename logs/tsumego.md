# Tsumego log

## Lessons (curated, ≤ 30 lines — read this first)
- Modern tsumego books are copyrighted, and sanderland/tsumego is MIT for its code only. Public-domain classics are OK only as our own transcriptions from original sources, because the UK/EU database right can protect modern datasets (2026-09-25, planning research).

## Entries (newest first)

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
