# Build-vs-buy: scoring (dead-stone proposal and score counting)

- Unit: 1.3 (Phase 1). Status: **Decided 2026-09-28: option A** (Claude, under the owner's delegation of all decisions), recorded in [ADR 0015](../decisions/0015-scoring-service-node-autoscore-goscorer.md).
- Date: 2026-09-27. Evidence gathered in a throwaway spike outside the repo (code and output below).

## Capability

These are the two PLAN §3.1 rows "Dead-stone proposal" and "Score counting given dead stones
(territory/area, seki)". After two passes, LiGo's scoring phase (PLAN §4.2) shows a proposal: which
stones are dead, whose territory each empty point is, and the score. Players accept, toggle groups
or resume play. Every toggle needs a recount under the game's ruleset (Japanese territory or Chinese
area), including seki, where Japanese rules give no territory. The count is also what the result
rests on, so it has to be computed on the server, not trusted from a player's browser.

## What the plan proposed

`services/scoring` (PLAN §3.6): a small Node process between Redis and KataGo. It asks KataGo's
analysis engine for two ownership maps (black to move, white to move), lets `goban`'s `autoscore`
pick the dead stones, counts with `goscorer`, and publishes `{deadStones, territory, score}` back to
lila. Without KataGo, goban's estimator plus manual marking. Fallback for counting: port goscorer to
Scala "only if calling the service turns out to be unworkable".

## What the spike found

Checked on 2026-09-27 against `goban-engine` 8.3.226 from npm (goban repo at `e61c56e2`,
2026-09-17), goscorer at `0ac5f59`, and KataGo v1.18.1 (Eigen CPU build, 4 cloud vCPUs).

1. **OGS ships a test set for exactly this pipeline, and the published package passes it.** The
   goban repo has 31 finished OGS games (9×9, 13×13 and 19×19, one Japanese seki game) in
   `test/autoscore_test_files/`, each with the board, the two ownership maps OGS's KataGo service
   produced, and the expected result (dead stones, territory, dame, points that still need
   sealing). Running the npm package's `autoscore` on OGS's stored maps reproduces all **31/31**.
   This is a regression check, not an accuracy figure: goban's fetch script
   (`scripts/fetch_game_for_autoscore_testing.ts`) drafts each expected result from those same maps,
   and a person then corrects it.
2. **With our own KataGo, autoscore gets 29 of 31, and the misses shrink as the network grows.** We
   fed the same boards to our local KataGo analysis engine (two queries, black and white to move,
   komi 7.5, board only and no move history, which is also what OGS sends) and ran autoscore on the
   answers:

   | Network (all from KataGo's repo or releases) | Visits | Matches the expected result | Time per position, 4 cloud vCPUs |
   |---|---|---|---|
   | b6c96 test net (cloud default today) | 100 | 29/31 | ~1 s |
   | b10c128 test net | 100 | 29/31 | ~2 s |
   | b10c128 test net | 500 | 29/31 | ~10 s (1–15 s) |
   | g170e b20c256x2 (a full-size 2020 net, CPU) | 100 | 29/31 | ~15 s (1–20 s) |

   The same two games miss every time, a 9×9 game from OGS's beta site and the Japanese seki
   game, but by less with each bigger network: wrong stones on the 9×9 game go 7 → 5 → 1 (b6, b10,
   b20), while the seki game stays at a few wrong points (22 or 4 → 3 → 3). Asking KataGo with Chinese rules instead (OGS's fetch
   script does) still misses the seki game, by 3 → 2 → 1 stones, so the rules setting is not the
   cause. None of these nets is the b18 net your box will run on its GPU, so 29/31 is a floor; the
   real accuracy figure is the Phase 4 gate (≥ 97% on a benchmark of finished games), measured
   there. The KataGo runs checked the plain result only, not the 7 cases' "sealed" variant (which
   passes 7/7 on OGS's stored maps).
3. **KataGo is not deterministic.** Two saved b6 runs at 100 visits disagree on the seki game (3
   stones removed, 4 points wrong in one; 13 removed, 22 wrong in the other) because the search is
   multi-threaded. So the service must store the proposal it showed and never recompute it
   silently; recounts after a toggle use goscorer only, which is deterministic.
4. **goscorer counts both rulesets and handles seki.** It is bundled inside `goban-engine` and
   reached through `GobanEngine.computeScore()`. On the seki game (stored maps), Japanese counting
   gives black 37 and white 18 points of territory where Chinese counting gives 49 and 25; the
   difference is the eyes of the seki groups, which Japanese rules do not count. On a 9×9 game,
   Chinese area adds up to all 81 points (39 + 42).
5. **KataGo's own dead-stone list is worse.** KataGo's GTP command `final_status_list dead` needs
   no autoscore at all, but matched only **21/31** (b6) and **22/31** (b10, at 100 and at 200
   visits) dead-stone sets, against 29/31 for autoscore, and it says nothing about points that still
   need sealing. The comparison is not perfectly even: GTP runs one search with one side to move and
   a different config (4 search threads), several of its misses are single stones, and it does get
   the seki game right. Its 9 misses against autoscore's 2 still make autoscore's two-map method
   worth its extra code.
6. **The autoscore and counting path runs in plain Node, no browser** (checked on Node 22 and 24;
   lila pins Node 24). `goban-engine` is one 126 KB bundle with a single dependency
   (`eventemitter3`). Not checked: the no-KataGo fallback. goban's default local estimator is a
   WASM module loaded through `window`/`document`, so in Node the fallback would be its pure-JS
   Voronoi estimator or manual marking only; Phase 4 settles that.
7. **OGS runs this the other way round, which LiGo should not copy.** On OGS a player's browser asks
   OGS's KataGo service for the autoscore and then sends the chosen dead stones to the server
   (`OGSConnectivity.ts`). In LiGo, `services/scoring` computes the proposal and the count, so a
   player cannot submit a forged one.
8. **Release and licence details:**
   - goban's npm releases lag its repo: 8.3.226 (2026-02-27) is the newest on npm, while the repo
     had commits until 2026-09-17. There are no git tags for 8.x, so a pin is to the npm version.
     `autoscore.ts` has only had a comment-only change since 2025-04.
   - Licences: `goban-engine` Apache-2.0; goscorer MIT (David J. Wu) and `eventemitter3` MIT, both
     bundled into goban-engine, but the bundle's `LICENSE.txt` only carries OGS's notice, so
     COPYING.md has to add their MIT notices itself; KataGo code MIT; KataGo's test nets are in its MIT repo. The licence of the
     full-size networks on katagotraining.org could not be read here (the site is blocked in cloud
     sessions) and must be checked before one is pinned.
   - goban's goscorer copy is v1.0.0 with one local fix; upstream goscorer has since fixed a bug
     that only affects 1×1 boards.
9. **What lila and strategygames already have.** lila has no Go scoring (it scores chess). Our
   chosen server rules library, strategygames (ADR 0012), has its own dead-stone phase and **area**
   counting, but no Japanese territory counting and no seki handling for it, so it cannot count
   half of LiGo's rulesets. Unit 1.1 left this comparison to this memo.
10. **Where the spike differs from PLAN §3.6.** The plan's request carries `moves`, `komi` and
    `handicap`; the spike, like OGS, sends KataGo the final board with komi 7.5 and corrects the
    score afterwards. Japanese counting also needs the prisoners taken during play: the service
    must get the capture counts from lila (which has them from strategygames) rather than replay
    the moves in goban-engine, which would be a second rules engine that could disagree. Phase 4
    decides the message format.

## Candidates

| Option | Ladder rung | Licence | Maintenance | Fit with lila | Effort | OGS handoff value |
|---|---|---|---|---|---|---|
| **A. `services/scoring` in Node: KataGo analysis + goban-engine `autoscore` + goscorer (the plan)** | 1–3 (use as-is, wrapped) | MIT + Apache-2.0 | KataGo and goban active; goscorer small and stable | Good: one queue boundary in Redis, as lila already does for fishnet-style work | Low–medium: a Node process of glue, Redis messages, process supervision | High: the same code OGS runs |
| B. Same service, KataGo's own `final_status_list` instead of autoscore | 1–3 | MIT (+ goscorer) | Active | Same as A | Low | Medium |
| C. No Node: lila talks to KataGo directly; autoscore and goscorer ported to Scala | 5 (port) | MIT + Apache-2.0 | We own ~2,800 ported lines (autoscore ~1,300, goscorer ~1,500) and hand-port upstream fixes | Everything in one JVM | High | Low |
| D. No AI: strategygames' dead-stone phase or goban's estimator, players mark stones | 1 | MIT / Apache-2.0 | Active | Fine | Low | Low |
| E. GNU Go's `final_status_list` | 1 | GPL-3.0 | Dormant | Another process like A | Low | Low |
| F. Count with strategygames (already a dependency, ADR 0012) | 1 | MIT | Active | In lila's JVM | Low | Low |

B loses too much accuracy (21–22/31 vs 29/31). D breaks the approved POC decision "KataGo proposes
dead stones" and is kept as the no-KataGo fallback. E is weaker than B. F only does area counting,
so it cannot score Japanese games or seki. That leaves A against C.

Whichever wins, only one component may be the score authority. strategygames' own dead-stone phase
and area count stay unused for the result; unit 1.7 (the adapter) maps lila's scoring phase onto
strategygames without letting it score.

### What each option gives and costs

**A. Node service (recommended).**
- Gives: the exact code OGS uses, with OGS's own 31-game test set as our first regression test; no
  port to maintain; TypeScript, which the UI already uses; the queue boundary lets a remote GPU
  worker take over later without a redesign.
- Commits LiGo to:
  - a third runtime process (lila, lila-ws, now `services/scoring`) that `dev/ligo up`, the docker
    setup and CI must start and supervise;
  - `goban-engine` as a new npm dependency of `services/scoring` (its own `package.json` and
    lockfile, pinned to 8.3.226), with Apache-2.0 and goscorer's MIT notice in COPYING.md;
  - a Redis protocol between lila and the service (PLAN §3.6), which is an architecture decision
    of its own when Phase 4 builds it;
  - KataGo's non-determinism: store the proposal shown, recount with goscorer only.

**C. Port to Scala.**
- Gives: one fewer process; scoring inside lila's own tests.
- Costs: about 2,800 lines of someone else's tuned heuristics to port and keep in step by hand;
  lila still has to run and supervise KataGo, so the process count only drops by one; a port can
  quietly drift from OGS's behaviour, which the 31-game test set would have to catch.

## Recommendation

**Option A**, as the plan proposed. The spike shows the reused parts work together in plain Node
with no changes, reproduce OGS's results exactly on OGS's own maps, and get 29/31 even with the
small cloud networks. The custom part stays glue: queue in, two KataGo queries, `autoscore`,
`computeScore`, queue out.

**Runner-up: C**, only if running a Node process next to lila turns out to be a real burden (the
plan's own escape hatch). The service boundary means lila would not notice the switch.

Relation to unit 1.2 (client engine and board, still open): A uses `goban-engine` on the server
whatever 1.2 decides for the browser. If 1.2 also picks `goban-engine`, both sides share one pinned
version, and the scoring-phase UI can show the same counts the server computes.

## What the owner must decide

Build `services/scoring` as a small Node service around KataGo, goban's autoscore and goscorer (A,
recommended), or port autoscore and goscorer to Scala inside lila (C)?

## Spike evidence

The spike (outside the repo) is a Node script over a copy of goban's `test/autoscore_test_files/`,
with `goban-engine@8.3.226` from npm and the installed KataGo:

```js
// spike.js  (node spike.js stored | node spike.js katago <visits>; NET=<model> picks a network,
//            CASE=<text> filters cases, KATA_RULES=<rules> overrides the rules sent to KataGo)
const { autoscore, GobanEngine, num2char } = require("goban-engine");
// ... load each case: board rows of "b"/"w"/" " -> 1/2/0 ...
// KataGo analysis engine, one query per side to move:
const q = { id, initialStones: stones, moves: [], initialPlayer: player,
  rules: d.rules === "japanese" ? "japanese" : "chinese", komi: 7.5,
  boardXSize: w, boardYSize: h, maxVisits: visits, includeOwnership: true };
// analysis_example.cfg has reportAnalysisWinratesAs = BLACK, so +1 = black in both maps
const [res] = autoscore(board, d.rules ?? "chinese", blackFirstOwnership, whiteFirstOwnership);
// pass rule copied from goban's test/test_autoscore.ts: every point matches correct_ownership
// ("*" = anything, "s" = must be in res.needs_sealing), and no unexpected needs_sealing
// counting: new GobanEngine({ width, height, initial_state, rules, removed: res.removed, komi: 0 }).computeScore()
```

Output (last line of each run; failing cases listed):

```text
$ node spike.js stored
stored: 31/31 match OGS's correct_ownership, 0.5 s total

$ node spike.js katago 100                       # b6c96 test net
FAIL game_beta_17150.json      9x9   removed=15 wrong= 11 wrong-stones=7  katago=899ms
FAIL game_seki_64848549.json   19x19 removed=13 wrong= 22 wrong-stones=14 katago=922ms
katago 100 visits: 29/31 match OGS's correct_ownership (29/31 dead-stone sets match), 25.9 s total

$ NET=b10.bin.gz node spike.js katago 100         # g170e-b10c128 test net
FAIL game_beta_17150.json      9x9   removed=13 wrong=  5 wrong-stones=5 katago=2122ms
FAIL game_seki_64848549.json   19x19 removed= 2 wrong=  3 wrong-stones=3 katago=2260ms
katago 100 visits: 29/31 match OGS's correct_ownership (29/31 dead-stone sets match), 65.1 s total

$ NET=b10.bin.gz node spike.js katago 500
katago 500 visits: 29/31 match OGS's correct_ownership, 301.8 s total   (same two failures)

$ NET=b20.bin.gz node spike.js katago 100         # g170e-b20c256x2, full-size
FAIL game_beta_17150.json      9x9   removed= 9 wrong=  1 wrong-stones=1 katago=15041ms
FAIL game_seki_64848549.json   19x19 removed= 2 wrong=  3 wrong-stones=3 katago=15095ms
katago 100 visits: 29/31 match OGS's correct_ownership (29/31 dead-stone sets match), 444.4 s total

$ CASE=seki KATA_RULES=chinese node spike.js katago 100   # b6, then NET=b10, NET=b20
[b6]  FAIL game_seki_64848549.json  19x19 removed= 2 wrong=  3 wrong-stones=3 katago=1098ms
[b10] FAIL game_seki_64848549.json  19x19 removed= 3 wrong=  2 wrong-stones=2 katago=2797ms
[b20] FAIL game_seki_64848549.json  19x19 removed= 4 wrong=  1 wrong-stones=1 katago=19042ms

$ node spike.js katago 100                       # b6 again, an earlier saved run: same 29/31,
FAIL game_seki_64848549.json   19x19 removed= 3 wrong=  4   # but a different seki answer

$ python3 gtp.py 100                              # KataGo GTP final_status_list dead, b6c96
gtp final_status_list 100 visits (g170-b6c96-...): 21/31 dead-stone sets match
$ NET=b10.bin.gz python3 gtp.py 100
gtp final_status_list 100 visits (b10.bin.gz): 22/31 dead-stone sets match
$ NET=b10.bin.gz python3 gtp.py 200
gtp final_status_list 200 visits (b10.bin.gz): 22/31 dead-stone sets match

$ SCORE=1 node spike.js stored                    # goscorer via computeScore, komi 0
PASS game_52136077.json        9x9
     chinese : B 39 W 42 (territory 26/30, stones 13/12, prisoners 0/0)
     japanese: B 26 W 30 (territory 26/30, stones 0/0, prisoners 0/0)
PASS game_seki_64848549.json   19x19
     chinese : B 177 W 150 (territory 49/25, stones 128/125, prisoners 0/0)
     japanese: B 40 W 20 (territory 37/18, stones 0/0, prisoners 3/2)
```

"wrong" counts points where autoscore's result differs from OGS's answer; "wrong-stones" counts only
stones called dead or alive wrongly, the same measure `gtp.py` uses. Prisoners in the counting lines
are only the stones marked dead, because the spike sets up the final position without the moves.

Networks used, with SHA-256: `g170-b6c96-s175395328-d26788732.bin.gz` (installed by
`dev/ligo katago install`), `g170e-b10c128-s1141046784-d204142634.bin.gz` from KataGo's
`cpp/tests/models/` (`1a8e05a4…8cc8b04`), `g170e-b20c256x2-s5303129600-d1228401921.bin.gz` from
KataGo's v1.4.5 release (`7c8a84ed…5101e7c2`).
