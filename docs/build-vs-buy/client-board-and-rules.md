# Build-vs-buy: client-side Go rules, SGF and board rendering

- Unit: 1.2 (Phase 1). Status: **Decided: option A** (npm, pinned), [ADR 0014](../decisions/0014-ogs-goban-for-client-rules-and-board.md). Chosen by Claude under the owner's 2026-09-28 delegation.
- Date: 2026-09-27. Evidence gathered in a throwaway spike outside the repo (code and output below).

## Capability

This covers two PLAN §3.1 rows, because OGS ships them as one library:

1. **"Client-side rules + SGF (analysis board, move hints, puzzles)".** The browser needs to know
   which moves are legal, which stones a move captures and where the ko is, to preview moves and to
   run the analysis board and tsumego without asking the server each time. It also reads SGF files.
2. **"Board rendering".** The board itself: drawing the grid, stones, last-move and ko markers,
   coordinates, and turning a tap or click into a move. lila draws chess with `chessground`; Go
   needs its own board, wrapped so lila's snabbdom views can use it (`libs/board`, PLAN §3.2).

The server stays the referee: every move is checked again in Scala (unit 1.1's strategygames). The
client engine only has to agree with it, which the conformance fixtures check (units 1.6 and 1.8).
Autoscore and the score estimator live in the same library but belong to unit 1.3 (scoring).

## What the plan proposed

OGS's `goban` library (Apache-2.0): its engine (`goban-engine`) for rules and SGF, and its SVG
renderer wrapped for snabbdom. Fallbacks: Sabaki's `@sabaki/go-board` + `@sabaki/sgf` for rules and
SGF, and Sabaki's `Shudan` (Preact) for the board.

## What the spike found

Checked on 2026-09-27 against npm `goban` and `goban-engine` **8.3.226** (published 2026-02-27; its
protocol types match goban commit `6276a50` of that day) and against goban's `main` at `e61c56e`
(2026-09-17).

1. **One library, two packages, Apache-2.0.** `goban` (the board plus the engine) and `goban-engine`
   (the engine alone, no DOM, for Node) are built from the same repo
   (`github.com/online-go/goban`, Apache-2.0, copyright Online-Go.com). Their only runtime
   dependency is `eventemitter3` (MIT). Apache-2.0 is compatible with AGPL-3.0 and is already on
   CI's npm licence allowlist. There is no NOTICE file, so we owe the licence text and copyright
   line in COPYING.md; the `goban-engine` package has only the Apache header
   (`goban-engine.js.LICENSE.txt`), no full LICENSE file, so COPYING.md carries it for both.
   **goscorer (MIT, copyright 2024 David J Wu, "lightvector") is bundled inside goban**, and the
   minified builds drop its notice (`lightvector` appears 0 times in `goban.min.js`,
   `goban-engine.js` or the spike's own bundle). `pnpm licenses` only sees `goban: Apache-2.0`, so
   no CI check would notice: COPYING.md must carry goscorer's MIT notice too.
2. **Actively maintained, but npm releases lag.** OGS itself runs on it (as a git submodule), with
   commits every week (latest 2026-09-17). npm releases are made by hand and are irregular:
   8.3.107 (Jul 2025), 8.3.147 (Sep 2025), 8.3.226 (Feb 2026). `main` is 160 commits ahead of the
   last release, but the rules code has not changed since: the engine commits since then add SGF
   time-property parsing, config and protocol fields, socket error recovery, AI-review and
   move-tree display, and no longer reading `window.user` for analysis; none touches `place`,
   `isBoardRepeating` or `BoardState`'s logic. The rest is a new native-app renderer and theme
   work.
3. **Its own tests pass.** At the release commit `6276a50`, goban's engine test suites (rules,
   SGF, conditional moves, stone strings, autoscore, score estimator) pass: **203 of 203**, in 8
   suites (Jest). Only superko has a single test.
4. **The rules cover what LiGo needs, with settings.** Captures, suicide refused, simple ko, and
   superko with a choice of algorithm. Its rule presets differ from ours (Japanese: superko off,
   "no result"; Chinese: "csk", which it treats as positional superko), but each game can override
   them: with `allow_superko: false, superko_algorithm: "ssk"` the spike (and the reviewer's
   re-run under Japanese) shows superko enforced under both rulesets. That it is *situational*
   (same player to move) comes from the source (`isBoardRepeating` compares only positions with
   the same player to move), not from the spike, whose position doesn't tell the two apart. The
   fixtures (1.6, 1.8) test it properly. Komi defaults (6.5 Japanese, 7.5 Chinese) are
   overridable too.
5. **One real rules difference: superko only looks back 30 moves.** `isBoardRepeating` stops
   after 30 earlier positions (`MAX_SUPERKO_SEARCH = 30`, "any more than this is probably a waste
   of time"). The spike shows a repetition refused normally but **allowed after 32 extra
   passes**. In a real game a cycle that long is rare, and the server (strategygames) is the
   referee, so the worst case is the board offering a move the server then refuses. The
   conformance fixtures would mark such cases as server-only, or we send OGS a small patch making
   the limit configurable (a natural first contribution for the OGS handoff).
6. **Handicap: goban has its own placement, and its presets would disagree with our server.**
   Given `handicap: N` and no starting position, goban places fixed stones from its own star-point
   tables (9, 13, 19), except under its Chinese preset, which switches to free placement (Black
   plays the handicap stones as moves). It also cuts komi to 0.5 by itself and, under Chinese,
   gives White handicap compensation in the score. Checked with goban-engine 8.3.226 (reviewer):
   `japanese handicap 2: free=false handicapMovesLeft=0 initial stones=[15,3:1,3,15:1] komi=0.5`;
   `chinese handicap 2: free=true handicapMovesLeft=2 initial stones=[] komi=0.5`. So the adapter
   must always pass the server's stones (strategygames places them, 1.1) as `initial_state` with
   `handicap: 0`, and always pass komi explicitly. Handicap scoring is 1.3's and the ratings
   unit's question.
7. **SGF: it reads well, but not the board size, komi or player to move.** It loads moves, variations, setup
   stones, comments, markup, players, ruleset, result and (on `main`, not yet on npm) time
   settings. It **ignores `SZ` (board size), `KM` (komi) and `PL` (player to move)**: OGS's
   server passes those separately. `PL` matters for tsumego import (Phase 8). The spike's 9×9 SGF loaded as a 19×19 board with Japanese komi until the size was
   passed in. It exports the move tree (moves and variations) but not the SGF header. So the
   analysis board's and the puzzle importer's SGF import needs a few lines of glue reading
   `SZ`/`KM`/`PL`, and a game's SGF download
   comes from the server (strategygames has SGF), which is where lila builds its downloads anyway.
8. **The board renders inside a snabbdom view and plays on a phone.** Bundled with lila's own
   esbuild (0.28.2), goban's SVG renderer mounted in a snabbdom `insert` hook and played a 9×9
   game on a desktop (1280×800) and a phone viewport (390×844, touch): tap shows a preview stone,
   a "Confirm move" button sends it (goban's built-in submit step: this is PLAN §1's
   tap-to-preview, confirm-to-place), captures are removed and counted, and a tap on an occupied point
   offers nothing to confirm. No page errors. Not tried in the browser: ko (checked in the engine
   spike), passes, and goban's dead-stone marking mode (the scoring phase, unit 1.3). Screenshots
   are attached to the unit 1.2 thread. Labels skip the letter I (A–H, J) while moves travel as SGF
   letters (`"ee"`); which form lila-ws uses is a protocol choice for Phase 3.
9. **It is built around OGS's server protocol, so the adapter plugs in at two points.** In play
   mode goban sends moves over OGS's websocket protocol and needs an OGS clock object before it
   will send. The spike made it work with (a) a four-line subclass overriding `sendMove`, a
   protected method, to hand the move to our own transport, and (b) a stand-in socket that feeds
   the server's echo back in OGS's message shape (`game/<id>/move`), so goban's own move handling
   runs unchanged. `libs/board` would translate between lila-ws messages and those two points.
   goban's clock code lives in that OGS protocol layer too, so the clock is shown by lila's round
   UI, fed by the server. lila's clock UI has no byo-yomi display yet: that is later clock work
   (logs/clocks.md), not something this choice settles.
10. **It is heavy compared with chessground.** The npm `goban` package is one pre-built webpack
    bundle, so nothing can be tree-shaken: the spike page is 413 KB minified, **104 KB gzipped**
    (chessground: 33 KB minified, 12 KB gzipped). Built from goban's source with lila's esbuild,
    taking only the SVG renderer, it is 292 KB minified, 71 KB gzipped (npm goban alone, same
    build: 399 KB, 99 KB gzipped, so about 28% less). The engine alone is
    126 KB, 38 KB gzipped. Lazy-loading the board on game pages keeps it off the lobby.
11. **Themes.** The plain board and plain stones are drawn in code. Wood boards and image stones
    load pictures from a base URL (OGS's CDN by default); we'd host our own copies, and their
    licences (they sit in goban's repo under its Apache-2.0 licence, but they are photos) get
    checked before any of them ship. Plain themes need nothing.

## Candidates

| Option | Ladder rung | Licence | Maintenance | Fit with lila | Effort | OGS handoff value |
|---|---|---|---|---|---|---|
| **A. `goban` from npm, pinned; `libs/board` wraps it** | 3 (wrap) | Apache-2.0 | Active; npm releases irregular (last Feb 2026) | Good: framework-free TypeScript, mounts in a snabbdom hook; one subclass + a message translator | Low–medium | High: the same board OGS uses |
| B. Vendor goban's source into `libs/board`, built by lila's esbuild | 4 (vendor minimally) | Apache-2.0 | We own the copy; fixes ported by hand (the monthly upstream-scout covers goban) | Good; ~28% smaller bundle (SVG renderer only); can take `main`'s fixes before an npm release | Medium: copy ~34,000 lines of TypeScript, keep a patch list | High, if we keep the copy close to upstream |
| C. Sabaki: `@sabaki/go-board` + `@sabaki/sgf` + `Shudan` | 1–3 | MIT | Shudan 1.8.0 and sgf 3.5.0 (Jul 2026); go-board 1.4.3 (2021) | Poor for the board: Shudan needs Preact inside snabbdom; go-board has no superko or rulesets, so we'd write them | Medium–high | Low |
| D. Build our own board and client rules | 6 (custom) | MIT (ours) | Us | Exact | High; the wheel ADR 0002 says not to reinvent | Low |

Also considered: goban pinned to a git commit through pnpm (gets `main` without vendoring, but
needs goban's own webpack build inside our install, so it is A's costs plus a build step); and
`tenuki` and `wgo` (MIT, last released 2022); `jgoboard` is CC BY-NC (PLAN's avoid
list).

### What each option gives and costs

**A. npm dependency.**
- Gives: the least code we own; the renderer, the engine, touch confirm, variations, markup and
  (for 1.3) autoscore from one maintained library that OGS relies on; bumping one version picks up
  fixes.
- Commits LiGo to:
  - a new npm dependency, `goban@8.3.226` pinned exactly (COPYING.md: goban's Apache-2.0 text and
    goscorer's MIT notice), in lila's pnpm workspace where
    `libs/board` is built (Phase 2 decides the package layout), with its lockfile entry. COPYING.md
    carries both notices. `goban-engine` is only needed for Node code (1.8's test harness,
    1.3's scoring service) and is the same code;
  - depending on protected and internal parts of goban (`sendMove`, the OGS message names), which
    a new release can change. Mitigation: a pinned version, the adapter as the only place that
    touches them, and adapter tests;
  - waiting for OGS's manual npm releases to get upstream fixes (or switching to B if we need one
    sooner);
  - about 100 KB gzipped on game pages, loaded lazily.

**B. Vendor.**
- Gives: `main`'s fixes without waiting for a release; a smaller bundle; the superko limit fixed in
  our tree straight away.
- Costs: 34,000 lines of someone else's TypeScript in our repo, lint/format exemptions for it, and
  hand-porting of every upstream change, including the native-renderer churn we don't use.

## Recommendation

**Option A.** It's the top rung that works: the spike ran goban's real renderer and engine inside a
snabbdom view on a phone, with ADR 0003's superko, and the glue is a subclass plus a message
translator. It keeps LiGo's board identical to OGS's, which is the handoff story.

**Runner-up: B**, which we'd switch to if A hurts: if we need a fix that OGS hasn't released, if
the bundle size matters on phones, or if a release breaks the parts the adapter relies on. The
adapter boundary means that switch wouldn't touch lila's views.

Either way, three things become adapter or fixture work, not reasons to build our own: the 30-move
superko window (fixtures mark it; offer OGS a patch), always passing handicap stones and komi from
the server, reading `SZ`/`KM`/`PL` on SGF import, and translating lila-ws messages into goban's two
entry points. Seki only affects scoring (1.3), not which moves are legal.

## What the owner must decide

Use OGS `goban` from npm, pinned, wrapped by `libs/board` (A, recommended), or vendor its source
into `libs/board` (B)?

## Spike evidence

The spike lived in a scratch folder with `goban@8.3.226`, `goban-engine@8.3.226` and
`snabbdom@3.5.1` (lila's version) from npm; nothing was installed into the repo.

**Engine in Node** (`engine-spike.mjs`, abridged: `mk(rules, extra)` builds a 9×9 `GobanEngine`,
`play` places moves such as `"e5"`, `tryMove` reports the error id):

```js
const koSetup = ["d5", "e5", "e4", "f4", "e6", "f6", "a1", "g5", "f5"]; // same shape as unit 1.1
for (const rules of ["japanese", "chinese"]) { const e = play(mk(rules), koSetup); /* print defaults, try e5 */ }
for (const rules of ["japanese", "chinese"]) mk(rules, { allow_superko: false, superko_algorithm: "ssk", komi: 6.5 });
play(mk("japanese"), ["b1", "e5", "a2", "e6", "g7"]); tryMove(e, "a1");      // White suicide
play(mk("japanese"), ["a2", "a1", "b1"]);                                   // Black captures a1
new GobanEngine({ original_sgf: sgf });  new GobanEngine({ original_sgf: sgf, width: 9, height: 9 });
// Superko window: goban's own superko test position, then the same repetition after 0 and 32 extra passes
```

```text
japanese: defaults allow_superko=true superko_algorithm=noresult komi=6.5
japanese: ko retake e5 now: illegal (illegal_ko_move)
chinese: defaults allow_superko=false superko_algorithm=csk komi=7.5
chinese: ko retake e5 now: illegal (illegal_ko_move)
japanese + ssk override: allow_superko=false superko_algorithm=ssk komi=6.5
chinese + ssk override: allow_superko=false superko_algorithm=ssk komi=6.5
suicide a1 by White: illegal (illegal_self_capture)
capture: White a1 removed=true, Black prisoners=1
SGF parsed with width/height passed in: size=9x9 komi=6.5 rules=chinese
SGF in: (;GM[1]FF[4]SZ[9]KM[5.5]RU[Chinese]PB[Alice]PW[Bob];B[ee];W[ce](;B[gc];W[gg])(;B[cg]))
SGF parsed: size=19x19 komi=6.5 rules=chinese players=Alice/Bob
move tree out:
;B[ee]
;W[ce]
(;B[gc]
;W[gg]
)(;B[cg]
)
superko repeat after 0 extra passes: illegal (illegal_board_repetition)
superko repeat after 32 extra passes: ALLOWED
```

**goban's own engine tests** at `6276a50` (the 8.3.226 release), `yarn install --frozen-lockfile
--ignore-scripts`, with the `canvas` native module moved aside (it has no prebuilt binary for Node
24; the engine tests don't need it):

```text
$ npx jest test/unit_tests/GoEngine test/unit_tests/GoMath test/unit_tests/StoneStringBuilder \
    test/unit_tests/autoscore test/unit_tests/ScoreEstimator test/unit_tests/GoConditionalMove src/engine
Test Suites: 8 passed, 8 total
Tests:       203 passed, 203 total
```

**Board in snabbdom** (`board.ts`, bundled with `lila/ui/.build`'s esbuild 0.28.2, abridged):

```ts
import { SVGRenderer, setGobanRenderer, setGobanCallbacks } from "goban";

// The adapter's override: moves go to our transport (lila-ws), not OGS's socket protocol.
class LigoBoard extends SVGRenderer {
  protected override sendMove(mv: any, cb?: () => void): boolean {
    socket.send("game/move", mv); cb?.(); return true;
  }
}
// socket: a stand-in for lila-ws that accepts every move and echoes it back as
// `game/1/move` {game_id, move_number, move}, the message goban's own play code listens for.

h("div.lg-board", { hook: {
  insert: (vnode) => { goban = new LigoBoard({
    board_div: vnode.elm, interactive: true, mode: "play", game_id: 1, player_id: 1,
    width: 9, height: 9, rules: "japanese", komi: 6.5, allow_superko: false, superko_algorithm: "ssk",
    square_size: Math.floor(vnode.elm.clientWidth / 10), double_click_submit: true,
    server_socket: socket, /* players, labels */ });
    goban.on("update", redraw); goban.on("submit_move", redraw); },
  destroy: () => goban?.destroy(),
} });
h("button#confirm", /* disabled unless goban.submit_move is set; click calls goban.submit_move() */);
```

Driven by Playwright in Chromium (`/opt/pw-browsers/chromium`), desktop 1280×800 with the mouse and
phone 390×844 with touch taps, nine moves each (E5, D5, A1, B1, A2, A3, C1, F4, B2, which captures
B1):

```text
tap on occupied e5 offers a move to confirm: false               (printed before the header line)
== desktop 1280x800: board 560px, square 56px, mode play
after one tap: messages sent=1, move waiting for confirm=true     (the 1 is game/connect)
info: move 9 · to move: white · prisoners B 1 W 0
client -> server: game/connect {"game_id":1,"chat":false}
client -> server: game/move {"game_id":1,"move":"ee"}
client -> server: game/move {"game_id":1,"move":"de"}
... (6 more moves)
client -> server: game/move {"game_id":1,"move":"bh"}
== phone 390x844: board 350px, square 35px, mode play
(same moves, same result)
page errors: none
```

Before the subclass, pressing Confirm threw `No last_clock when calling sendMove()`: goban's own
`sendMove` expects an OGS clock object.

**Bundle sizes** (esbuild `--bundle --minify`, gzip -9; KB = 1,000 bytes):

| Bundle | Minified | Gzipped |
|---|---|---|
| Spike page: npm `goban` + snabbdom + eventemitter3 | 413 KB | 104 KB |
| goban from source (`e61c56e`), SVG renderer only | 292 KB | 71 KB |
| npm `goban-engine` alone | 126 KB | 38 KB |
| lila's `chessground` 10.2.0, for comparison | 33 KB | 12 KB |
