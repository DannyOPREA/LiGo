# Rules engine log

## Lessons (curated, ≤ 30 lines — read this first)
- PlayStrategy's strategygames Go package is pure Scala since Aug 2026 (MIT). It has area scoring, situational superko, handicap placements and dead-stone agreement (2026-09-25, planning research).
- PlayStrategy's Go bug history gives us test cases: early game end on repetition, infinite games by a losing player, dead-stone countdown/expiry, one-click group selection (2026-09-25, planning research).
- strategygames is one artifact for all its games, published only to PlayStrategy's GitHub-hosted Maven repo (raw.githubusercontent.com/Mind-Sports-Games/lila-maven). Its Go package and `ByoyomiClock` load no other game's classes; exclude `fairystockfish`, `com.joansala.aalina`, `com.joansala` to drop the native and unused-game jars (Fairy-Stockfish GPL-3.0; aalina/samurai GPL-3.0-or-later per their POM headers, no `<licenses>` element: read the whole POM) (2026-09-27, 1.1).
- strategygames Go: two passes open its own dead-stone selection phase, not game end; komi defaults to 5.5 on 9×9 and 7.5 on 13×13/19×19 (overridable per game); no Japanese/Chinese ruleset notion (2026-09-27, 1.1).
- Superko history differs by engine: strategygames skips situations after passes, goban skips the start position and looks back only 30 moves; strategygames counts passes across a resume (4th pass settles with no dead stones). The spec (docs/rules) is the truth; adapters bridge (2026-09-27, 1.5).
- OGS goban (Apache-2.0) ships an engine-only package, `goban-engine`, with JP/CN/AGA/etc. rules, SGF and time systems (2026-09-25, planning research).
- goban-engine: `place(x, y, true, true)` is the fully checked move (the defaults skip ko and only flag superko); its SGF loader plays moves unchecked and silently turns an out-of-turn move into an edit; its fixed handicap placement runs only without `initial_state` (2026-09-28, 1.8).
- KataGo as a rules oracle: legality from the NAN mask of `kata-raw-nn`'s policy (its GTP `play` is tolerant); `final_score` removes stones in the opponent's pass-alive area, so compare scores only on settled boards (2026-09-28, 1.9).

## Entries (newest first)

### 2026-09-29 · unit 7.2 · The analysis tree's SGF in libs/board
- Did: `libs/board/src/sgf.mjs` (+ hand-written `sgf.d.mts`): `readTree` reads an SGF record into
  lila-shaped nodes (id = the move, `..` a pass; stones, captures, ko, player to move, comments,
  glyphs, other properties kept), replaying every move through `play`; `writeTree`, `playFrom`,
  `decodeSgf`, `rootSettings`. The root table `libs/conformance/sgf/root.json` (42 cases: sizes,
  rulesets, komi in stones, handicap, setup, player to move), shared with 7.3. `@sabaki/sgf` 3.5.0
  added (MIT, with `doken`), 56 tests, and the parity test reads the 227 server SGF games with it.
- Worked: `@sabaki/sgf` throws on a truncated file (goban's reader hangs), unescapes, expands old
  long names (`AddBlack` → `AB`) and drops empty variations; goban's `jumpTo` makes a depth-first
  replay with one engine cheap.
- Didn't work / dead ends: `@sabaki/sgf` doesn't bundle for the browser as published: `parse.js`
  requires `fs` and its optional charset detectors pull in Node's `buffer` and `string_decoder`.
  Fixed with a one-field pnpm patch (`browser: { fs, iconv-lite, jschardet: false }`) and
  `ignoredOptionalDependencies` for the detectors; `iconv-lite` still resolves through pnpm's
  hoisting (another package uses 0.6.3), so the patch, not the ignore, is what keeps it out.
  Deeply nested variations overflow its recursive parser (caught: RangeError → refusal).
- Lessons: sibling order needs care in an explicit-stack DFS (push the level's children last to
  first); run `libs/board` scripts from `lila/` (`pnpm --filter @ligo/board run …`), not from
  `libs/board`, or pnpm treats it as a separate project and refuses esbuild's build script.
- Decisions: the patch and `ignoredOptionalDependencies` (how ADR 0023's "charset packages not
  installed" is done), a moveless node's notes join the move before it, the same move twice from one
  position becomes one node, Claude under the owner's 2026-09-28 delegation (logs/decisions.md).
- Verified by Claude: `node --test test/sgf.test.mjs` 56/56; lint, typecheck; `dev/ligo test rules`;
  `dev/ligo compile ui`; verify.sh. · Needs owner verification: none beyond running
  `dev/ligo test rules` on the Fedora box once (docker mode).
- Review (reviewer agent) found and Claude fixed: stray pnpm files from running scripts in
  `libs/board`; a move or `AE` in the first node silently dropped (now refused); quadratic time on
  200 KB of moveless nodes or setup rectangles (12 s; now a 10,000-node cap, a Set, merges in place:
  under 1 s); all-lowercase names silently dropped by @sabaki/sgf (now refused); lossy write-back
  of merged notes and `HA[1]`; komi unbounded (now |komi| ≤ 1000); the length limit counted
  characters (now bytes); `tt` accepted as a pass below 19×19. Left as is: `decodeSgf` can read a
  `CA[` inside an early comment (a wrong charset only garbles text, the moves are ASCII).
- Follow-ups: 7.3 replays `root.json` in Scala and refuses what this reader refuses (a move or `AE`
  in the first node, capital-less names, over 10,000 nodes, over 200 KB in bytes); 7.4 wires
  `readTree`/`writeTree` into `/analysis`.

### 2026-09-28 · unit 4.3 · Scoring phase, results and SGF game info in libs/go-rules
- Did: `Scoring` (open on the service's proposal, whole-chain toggles, acceptances, count versions
  and pending recounts, ADR 0020 §3), `GameResult` (totals to `B+3.5` / jigo `0`, and `R`/`T`/`F`/
  `Void`), `GoGame.chainAt` (strategygames' `Chain.at`), `GoGame.closePlay` for the 1,000-ply cap
  (new refusal `play-closed`), `SgfInfo`/`SgfTime` for `PB`/`PW`/`BR`/`WR`/`DT`/`PC`/`TM`/`OT`/`RE`.
  The spec gains R-END-6 (move cap) and R-SP-10 (no count possible → `Void`) and §11 items 9–10
  (go-rules-expert).
- Worked: toggles and accepts naming the count version make "accept a count you haven't seen"
  impossible in the model itself, not only in lila.
- Didn't work / dead ends: `closePlay` first refused a game already in the scoring phase, so a cap
  reached by the second pass would still allow resume (go-rules-expert spotted it); it now always
  closes.
- Lessons: an enum method can't share a name with its cases' fields in Scala 3 (`winner` →
  `winningColor`).
- Decisions: R-END-6 and R-SP-10 wording, Claude under the owner's 2026-09-28 delegation
  (ADR 0020, logs/decisions.md).
- Review (reviewer agent): nothing blocking. Fixed its findings: count versions now carry the
  phase number (request numbers restart per phase, so an accept from an earlier phase could have
  landed on a new count; ADR 0020 §3/§6 amended to `v: "n:cv"`); `GameResult.Scored` keeps the
  two totals so no impossible result can be built; `counted` checks the count's dead stones match
  the marks; more tests (other dead chains stay dead, off-board toggle, play/undo on a closed
  game, line breaks in SGF names); R-SP-10's wording.
- Verified by Claude: `dev/ligo test rules`, verify.sh. · Needs owner verification: none for the
  library; whether OGS and Sabaki read `OT[10 fischer]` and `OT[3 days per move]` is checked in
  unit 4.11.
- Follow-ups: lila wiring in unit 4.8, which must close play again after replaying a capped game
  (closing isn't a stored action); SGF export in 4.11.

### 2026-09-28 · 1.9 · Nightly differential test against KataGo
- Did: added the differential test in libs/go-rules' test scope (`differential/`): seeded random games (random size, ruleset, handicap 2–9 in a fifth of games; random stones that don't fill the mover's own one-point eye; mid-game passes, takebacks and resumptions) played by the adapter while KataGo v1.18.1 follows over GTP; after every action it compares the legal points, stones, player to move and captures, and at the end the area score (strategygames' own count vs KataGo's `final_score`). `DifferentialTest` checks the plumbing without KataGo (real `showboard` output, an adapter-backed oracle, two planted-bug oracles). `dev/ligo differential` (native mode), `dev/katago.sh env` and `LIGO_KATAGO_TEST_NET_ONLY`, and `.github/workflows/nightly-differential.yml` (1,000 games nightly with new seeds, 60 on PRs touching libs/go-rules; report in the job summary, SGFs of disagreeing games as an artifact; not a required check).
- Worked: 1,000 games (seeds 20260928–20261927, 522 9×9, 260 13×13, 218 19×19, 219 with handicap) all agree: 228,125 actions (216,121 stones, 9,658 passes, 2,346 takebacks, 311 resumptions), 79,703 stones captured, 1,367,774 suicide / 10,379 simple-ko / 1,271 longer-superko refusals seen by both, 1,000 final scores; 29 min on 4 cores. Mutation: KataGo switched to simple ko made 23 of 60 games disagree (legal points) — the test bites.
- Didn't work / dead ends: KataGo's `final_score` on an unsettled board differs from a plain count by design: KataGo's area count (boardhistory.cpp `countAreaScoreWhiteMinusBlack`) treats stones inside the opponent's pass-alive area as dead (seed 36: W+22.5 vs 17.5). Fixed by ending games only when both final passes are forced (every empty point a one-colour eye). `java.util.Random` with neighbouring seeds drew 13×13 for seeds 1–20; seeds are mixed through `SplittableRandom` now. Classifying refused points with `play` cost ~1 ms each on 19×19; a board check does it now.
- Lessons: KataGo's legality oracle is the NAN mask of `kata-raw-nn`'s policy (strict: ko, situational superko, suicide); `play` is tolerant. `showboard`'s "B stones captured" counts Black stones lost. KataGo scores unsettled boards with pass-alive dead-stone removal, not Tromp-Taylor. ParityExportTest's random games (1.8) are an export, not a lockstep driver, so the differential has its own.
- Decisions (Claude, under the owner's 2026-09-28 delegation): the server-side score is strategygames' own area count (goscorer joins the comparison when services/scoring exists, Phase 4); scores compared on settled boards only; the test network only; the workflow is not a required check.
- Review (reviewer agent): no blocking findings; re-ran /verify, a 30-game real run, and KataGo mutations (komi 100, suicide allowed, simple ko) through wrappers, all red; shellcheck clean. Claude fixed its non-blocking findings: an adapter that refuses a point it listed as legal (or a pass) is now a disagreement with an SGF instead of an "incomplete" run; worker errors go into summary.md; a run that scores under 90% of games fails; the takeback is only computed on its 1% roll (it replays the game); the artifact is also kept on a cancelled or timed-out run; PLAN §6 notes the workflow is not a required check; "point-positions" wording.
- Verified by Claude: the 1,000-game run and the mutation run above, DifferentialTest, dev/ligo test rules, /verify; the workflow's 60-game PR run is green on GitHub (KataGo's CPU build installs and runs on ubuntu-latest). · Needs owner verification: none required; optionally glance at the first nightly run's summary in the Actions tab.
- Follow-ups: when services/scoring lands (Phase 4), add goscorer's count to the score comparison; strategygames' 1001-ply superko game (GoSituationalSuperkoTest, 1.6 note) could be replayed through the same oracle.

### 2026-09-28 · 1.8 · goban-engine harness, SGF read-back, parity with the server
- Did: added libs/board, a standalone pnpm package pinning goban-engine 8.3.226 (ADR 0014). `src/engine.mjs` builds every engine with LiGo's settings (ssk superko in both rulesets, no suicide, explicit komi, the server's handicap stones as `initial_state` with White to move), maps goban's move errors to the fixtures' reasons, works out R-KO-4's ko point (goban has none), and reads SGF with glue for SZ/KM/PL (goban's reader ignores them) and a check that no move became an edit. Tests: client fixture harness (95 cases, 189 runs; the 10 runs of the 5 known-gap cases run as expected failures), engine tests (incl. goban's own handicap table vs R-HCP-4), and a parity test replaying `libs/go-rules`' new `ParityExportTest` output: 227 server fixture games as SGF read back, and 80 seeded random games (9x9/13x13/19x19, handicap, passes, resumes; 16,100 actions) compared after every action, with every empty point's refusal reason at probed plies. `dev/ligo test rules` runs both engines then parity; `dev/ligo test board` the client alone; the `rules` CI job gained node/pnpm steps and an npm licence check; notices for goban-engine, the bundled goscorer and eventemitter3.
- Worked: every client fixture passed at the first run, as 1.6's scratch cross-check predicted; the random games found no difference. Mutations are caught: superko off (40 failures), positional superko (22), ignoring SGF SZ (182) or PL (42), a wrong ko point rule (56), `tryMove` leaving the probe played (120).
- Didn't work / dead ends: `node --test` with no arguments also runs helper modules in test/ as test files (name the files). A known-gap allowance in the random-game comparison was never exercised by the seeds, so it was dropped rather than kept untested.
- Lessons: goban-engine's `place(x, y, true, true)` is the checked move (defaults skip ko and only flag superko); on refusal it restores the position itself, and `jumpTo(node)` undoes an accepted probe. Its SGF loader plays moves unchecked and turns an out-of-turn move into an edit silently, so readers must check `edited`. Fixed handicap placement only runs without `initial_state`.
- Decisions: libs/board is its own pnpm package for now (Phase 2 decides how it joins lila's workspace); plain JavaScript modules with JSDoc, no build step; the parity data is written by an sbt test so CI's existing `testFull` produces it.
- Review (reviewer agent) found and Claude fixed: goscorer's MIT text cut short in NOTICE.md; ADR 0014 amended (standalone package, `handicap: N`); `tryMove` left probe branches in goban's move tree (now removed); goban's SGF reader swallows parse errors and lets `RU` override the ruleset (both refused now); known-gap cases must fail on the refused move itself; unknown `expect` fields fail; the handicap test used goban's own points; `docker_board` now writes the docker env; server.json carries a fixtures hash so stale parity data fails.
- Verified by Claude: dev/ligo test rules (252 sbt tests, 508 node tests), mutation runs (reviewer: 13 more), dev/tests/run.sh (46), /verify. · Needs owner verification: docker-mode `dev/ligo test rules` and `dev/ligo test board` on the Fedora box (the ui container runs pnpm in libs/board).
- Follow-ups: offer OGS the superko patches (30-move window, starting position); Phase 2 wraps goban's renderer in libs/board; 1.9 (KataGo differential) can reuse ParityExportTest's random-game generator.

### 2026-09-28 · 1.7 · CI fix and review findings
- Did: fixed the red `rules` job (sbt 2's thin client read `sbt scalafmtCheckAll testFull` as one command; now `sbt "scalafmtCheckAll; testFull"`, reproduced locally before and after). Independent review: added COPYING/NOTICE rows for joda-time and scala-parser-combinators (Apache-2.0, pulled in by strategygames; joda-time's NOTICE reproduced), jar pin checked after `sbt update` and before tests (CI, `dev/ligo test rules`), check-pin explains a missing cache, docker mode keeps sbt/coursier downloads in `.ligo/rules-cache`, takebacks rebuild by replay instead of keeping every earlier game (~0.9 MB per 300-move 19x19 game), harness fails on unknown `expect` fields, a 13x13 test. Owner delegated all decisions (2026-09-28): both 1.7 questions settled on the recommendation.
- Worked: 251/251 tests; the reviewer's mutations (post-pass superko, pass reset, resume limit, suicide vs superko, undo history) were all caught.
- Didn't work / dead ends: a `sed … && grep` chain silently skipped this entry when scalafmt had reflowed the target line; check each step's output.
- Lessons: list new transitive jars in COPYING, not just the direct dependency; `unzip -l` them for NOTICE files. Run an integrity check before the tests execute the artifact. sbt 2 CLI: pass several commands as one quoted `"a; b"`.
- Decisions: under the owner's delegation, the adapter owns resume and its limit; SGF read-back in 1.8.
- Verified by Claude: dev/ligo test rules (251), /verify, check-pin with a bogus cache. · Needs owner verification: docker-mode `dev/ligo test rules` on the Fedora box.
- Follow-ups: Phase 3: lila should not call `legalPoints` on every move (~3 ms on a full 19x19 board).

### 2026-09-27 · 1.7 · libs/go-rules adapter over strategygames
- Did: added libs/go-rules, its own sbt 2 build (Scala 3.8.4 and scalalib 11.10.12 as lila) depending on strategygames 10.2.1-s3-ps14 with fairystockfish/aalina/joansala excluded (ADR 0012). `GoGame` wraps strategygames' `Game` and adds post-pass superko situations (open point 1), the scoring phase (R-SP-1), resume with pass-count reset (R-SP-6) and the resume limit (R-SP-9), takebacks (R-KO-8), 1-stone handicap as no stone (R-HCP-2), setup checks and `Komi.standard`. `Sgf.write` exports FF[4] with AB/AW/PL/HA/KM/RU. Tests: the fixture harness (115 server cases, 228 runs over both rulesets), seeded random-game property tests on 9x9/19x19, unit tests, SGF tests. `dev/ligo compile|test rules`, a `rules` CI workflow and area in changed.sh, verify gates, `check-pin.sh` for the jar's SHA-256; PlayStrategy's repo added to dev/cloud-setup.sh.
- Worked: every server fixture passed first time; mutation checks showed the harness bites (dropping post-pass situations fails 4 runs, dropping the pass reset 8, dropping the resume limit 6). Resolving with the exclusions pulls only strategygames, joda-time, scala-parser-combinators, cats and pprint on top of scalalib.
- Didn't work / dead ends: `sbt -batch "compile" "export ..."` in sbt 2's thin client (use `--client "a; b"`). A class named `Fixture` clashes with munit's `Fixture[T]`. Calling `legalPoints` every move made the property tests time out (~22 ms on 19x19); try random empty points instead.
- Lessons: strategygames exposes enough public API (Board.copy, History.afterPosition, Board.positionHash) to add post-pass situations and reset the pass count without patching it. sbt 2's `test` is incremental (testQuick): use `testFull` wherever fixtures change without code. Play costs ~1.5 ms on 19x19 cold; fine for the server, too slow to call `legalPoints` in tight loops.
- Decisions: asked the owner (cards, building on the recommendation): the adapter, not lila, owns scoring-phase state and the resume limit; the SGF read-back part of the round trip moves to 1.8 (1.7 writes SGF only). Adapter choices disclosed in the PR: takebacks never reach back past a resumption; SGF omits HA for a 1-stone handicap; komi limited to multiples of 0.5 within the board's point count.
- Verified by Claude: dev/ligo test rules (250 tests), check-pin.sh, scalafmtCheckAll, dev/tests/run.sh (45), shellcheck, /verify. · Needs owner verification: docker-mode `dev/ligo test rules` on the Fedora box (mounts libs/ into the lila container); adding the `rules` job to the main ruleset's required checks.
- Follow-ups: Phase 3 wires libs/go-rules into lila's build; 1.8 reads the adapter's SGF in goban-engine; byo-yomi clock tests come with the clocks unit; offer PlayStrategy a patch for post-pass situations if open point 1 stands.

### 2026-09-27 · 1.6 · Conformance fixture format and 130 imported/new cases
- Did: defined the fixture format (libs/conformance/README.md) and a dependency-free checker (check.mjs, 22 tests, fast-check.sh; `--coverage` lists cases per spec rule ID). go-rules-expert drafted 130 cases in the scratchpad: strategygames 58, goban 20, KataGo 26, LiGo's own 26 (takeback, resume and resume limit, long ko fight, superko 38 moves back, bent four, handicap 1 and Chinese compensation, jigo). meta CI runs the checker; fixture-only changes skip the lila build. Imported files keep their source's licence (NOTICE.md, COPYING.md §3).
- Worked: a scratch cross-check replaying every case in goban-engine 8.3.226 (superko set to ssk) and KataGo v1.18.1's analysis engine, whose policy array marks illegal moves with -1 under strict situational superko: 227 case×ruleset runs, the only 10 disagreements are the client gaps spec §9 names. The reviewer's independent rules model agreed on all 115 expect cases; all 18 scores match goban's computeScore (goscorer); open point 1 flips exactly the 2 cases tagged with it.
- Didn't work / dead ends: KataGo's GTP `play` and the analysis engine's `moves` are both tolerant (they accept ko retakes and multi-stone suicide), so neither is a legality oracle; only the policy mask is. goban's own superko test (GoEngine.test.ts:308) passes only because goban never checks the starting position, so it was imported cut short with a client known gap. goban-engine has no scoring phase (phase stays "play" after two passes).
- Lessons: replay every imported sequence in a second engine, because a source test can carry its own engine's gap. Embedding a small test board in 9×9 changes liberties at its old far edges; wall it with opposite-colour stones that each keep a liberty, and check step by step. Only a whole-board cycle (e.g. seven independent kos) reaches a situation more than 30 moves back.
- Decisions: fixture licensing kept conservative (each imported file keeps its source's licence) rather than relicensing restated positions as MIT. New `illegal` reason `in-scoring` for a stone or pass during the scoring phase (R-SP-1). Merged 2026-09-28 after the spec's approval, under the owner's "don't ask for my approval for anything" delegation. Open for 1.7: whether the libs/go-rules adapter or lila owns scoring-phase state (resume, resume limit), which 12 server-only cases need.
- Verified by Claude: checker tests, check over all drafts, both-engine replay, reviewer's model and score checks, dev/tests/run.sh. · Needs owner verification: the fixtures as a whole (they encode the draft spec, PR #13); the bent-four shape (ligo-bent-four-*); the seki dead stones (goban-score-seki-game-*).
- Follow-ups: 1.7 builds the server harness (the first check of phase, resume, resume-limit, in-scoring, undo); 1.8 the goban-engine harness honouring knownGaps; offer OGS patches for goban's start-position and 30-move superko gaps; the 1001-ply strategygames game (GoSituationalSuperkoTest) suits the 1.9 differential test.

### 2026-09-28 · 1.5 · Owner approved the rules spec
- Did: recorded the owner's approval of all 11 open points (as recommended) in docs/rules (status lines), logs/decisions.md and STATUS.
- Worked: one approval card for all 11 points, answered the next morning.
- Didn't work / dead ends: none.
- Lessons: none new.
- Decisions: spec §12, all as recommended (owner) → docs/rules/spec.md is the rules truth.
- Verified by Claude: docs-only; /verify and CI on PR #13. · Needs owner verification: J1989/C2017 article numbers (from memory).
- Follow-ups: 1.6 fixtures cite the rule IDs.

### 2026-09-27 · 1.5 · Rules spec drafted for owner approval
- Did: go-rules-expert wrote docs/rules/spec.md (rule IDs for moves, situational superko and its history, handicap tables, komi, end of play, scoring phase, Japanese/Chinese scoring, results; an engine-mapping table; a fixture checklist; intentional departures from J1989/C2017; 11 open points) and a README index. Engine facts checked in strategygames 7344183, goban-engine 8.3.226 (npm source map), KataGo v1.18.1 boardhistory.cpp and goscorer 0ac5f59; goban-engine run for handicap tables, compensation and two superko probes. The reviewer re-ran the tables and the probes before the draft went into the repo.
- Worked: both engines place 2–9 handicap stones on identical points on 9×9 and 19×19 (checked mechanically, GTP and SGF). goban's own "superko" test position (plus White C19) gives two ready-made fixtures that separate the engines.
- Didn't work / dead ends: J1989/C2017 texts unreachable (proxy 403 outside GitHub/npm/Maven), so article numbers are marked "from memory". Direct docs/rules writes stalled on owner prompts while he was away; drafts moved to the scratchpad and were applied in one write per file.
- Lessons: engines disagree on the superko history: strategygames records no situation after a pass (goban and KataGo do); goban never checks the starting position and looks back only 30 moves. strategygames keeps counting passes across a resume and settles with no dead stones on the 4th pass; its 1-stone handicap places a stone. goban's Chinese preset uses free placement, and its Chinese compensation depends on the `handicap` field (memo 1.2's `handicap: 0` recipe loses it). Replay every move sequence a spec cites; test any "bounded by X" claim (the reviewer caught "bounded by clocks", false under byo-yomi/Fischer/correspondence).
- Decisions: 11 open points put to the owner as one approval card (spec §12, logs/decisions.md).
- Verified by Claude: goban-engine runs and handicap-table conversions (writer and reviewer); strategygames/KataGo/goscorer facts read from source with file:line. · Needs owner verification: the 11 open points; J1989/C2017 article references.
- Follow-ups: 1.6 builds the pass-node and start-position superko fixtures; 1.7 adds post-pass situations to the server's superko history (if open point 1 = yes), resets the pass count on resume, builds 1-stone games as handicap 0, rejects >9 stones; 1.8 passes handicap N + free_handicap_placement:false + initial_state + explicit komi to goban and marks its 30-move window and start-position gap as known client gaps.

### 2026-09-27 · 1.1 · Owner chose strategygames as a dependency
- Did: recorded the owner's answer (option A) as ADR 0012; marked the memo decided; updated STATUS and decisions.md.
- Worked: the question went out as a decision card with work continuing, and was answered the same afternoon.
- Didn't work / dead ends: none.
- Lessons: none new.
- Decisions: A, dependency with fairystockfish/aalina/joansala excluded (owner) → ADR 0012.
- Verified by Claude: docs-only; /verify and CI on the PR. · Needs owner verification: none.
- Follow-ups: unit 1.7 adds the dependency, the resolver (lila build, dev/cloud-setup.sh, CI), the SHA-256 in docs/UPSTREAM.md and the COPYING.md notice.

### 2026-09-27 · 1.1 · Build-vs-buy: server-side Go rules (strategygames spike)
- Did: broke Phase 1 into units 1.1–1.9 (PLAN §5). Spiked strategygames `10.2.1-s3-ps14` (commit 7344183) in a throwaway sbt 2.0.9 / Scala 3.8.4 project with lila's scalalib and scalachess versions; ran its own Go tests; exercised its `ByoyomiClock`; wrote docs/build-vs-buy/server-go-rules.md; asked the owner A (dependency, exclusions) vs B (vendor Go package).
- Worked: resolution from PlayStrategy's repo; Scala 3.7.4-built artifact consumed from 3.8.4; a 9×9 ko retake refused; `-verbose:class` showed only `strategygames`, `.go`, `.go.format`, `.go.variant` classes loaded; exclusions leave only strategygames, joda-time and scala-parser-combinators beyond scalachess's jars; 413/413 of its Go tests pass on its own build.
- Didn't work / dead ends: `sbt "show x" run` fails in sbt 2 (can't mix input tasks); `-Dsbt.override.build.repos=false` ignored because a running sbt server kept its JVM options; `git ls-tree --long` on a blobless clone fetches every blob (killed).
- Lessons: see the two 2026-09-27 lines in Lessons (and one sbt lesson in tooling.md). The reviewer caught three memo errors before the PR: aalina/samurai called "no licence" (their POM headers say GPL-3.0-or-later), 9×9 komi (5.5, visible in the spike's own output), and the byo-yomi half of the §3.1 row left out. Cross-check memo facts against the spike's output and cover the whole §3.1 row.
- Decisions: A vs B asked in the unit thread, pending (logs/decisions.md). ADR follows the answer.
- Verified by Claude: the spike output and test run quoted in the memo. · Needs owner verification: none technical; the choice itself.
- Follow-ups: the adapter unit (1.7) maps lila's scoring phase onto strategygames' dead-stone phase and sets komi/ruleset; record the jar's SHA-256 in docs/UPSTREAM.md if A is chosen. Add Go-side byo-yomi clock tests (its clock tests live in its shogi package). Its tests were not run against Scala 3.8.4 (only its own 3.7.4 build); 1.7 runs them through our adapter.
