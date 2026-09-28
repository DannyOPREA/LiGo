# Board UI log

## Lessons (curated, ≤ 30 lines — read this first)
- chessground is built around square cells and pieces; PlayStrategy drawing Go on it is awkward. Plan: wrap OGS goban's SVG renderer (2026-09-25, planning research).
- Avoid jgoboard (CC BY-NC); Shudan (MIT, Preact) is the fallback (2026-09-25, planning research).
- goban's SVG renderer mounts in a snabbdom `insert` hook (`new SVGRenderer({board_div, ...})`, `destroy()` in the destroy hook). In play mode it sends moves over OGS's protocol and needs an OGS clock first: subclass it and override `sendMove`, and feed server moves in as `game/<id>/move` events on a stand-in socket. Set `square_size` from the container width; "auto" draws a tiny board (2026-09-27, 1.2).
- goban's rule presets are OGS's, not ours: pass `allow_superko: false, superko_algorithm: "ssk"` and the komi for every game. Its superko check looks back only 30 moves, and its SGF reader ignores `SZ`, `KM` and `PL`. Given `handicap: N` it places its own stones (free placement under its Chinese preset) and cuts komi: always pass the server's stones as `initial_state` with `handicap: N` (spec §9: goban then places none itself and keeps the Chinese compensation), and komi (2026-09-27, 1.2; handicap value corrected in 1.8).
- goban bundles goscorer (MIT, lightvector) and its minified builds drop that notice; `pnpm licenses` only sees Apache-2.0. COPYING.md carries goscorer's notice by hand (2026-09-27, 1.2).
- npm `goban` is a pre-built bundle (no tree-shaking): ~104 KB gzipped vs chessground's 12 KB; its npm releases lag `main` by months (2026-09-27, 1.2).

## Entries (newest first)

### 2026-09-28 · Phase 2 breakdown · Split board integration into units
- Did: split PLAN §5's Phase 2 row into units 2.1–2.4 (board in `libs/board`, playground page, touch-confirm setting, visual snapshots + demo), each with what it needs; refreshed docs/STATUS.md.
- Worked: the 1.2 memo, ADR 0014 (and its unit 1.8 amendment) and this log's Lessons already answer the build-vs-buy questions, so no new memo is needed for Phase 2.
- Didn't work / dead ends: none. Every Phase 2 unit sits on unit 1.8's `libs/board`, so none can start before PR #17 merges (only 2.3's server-side preference could).
- Lessons: lila's "submit move" preference confirms after the move (a confirm bar), not the tap-to-preview Go players expect; touch-confirm gets its own preference.
- Decisions: the split and the touch-confirm preference, Claude's calls under the owner's 2026-09-28 delegation (logs/decisions.md).
- Verified by Claude: `bash .claude/skills/verify/verify.sh` (see PR). · Needs owner verification: none; skim the four units if you like.
- Follow-ups: 2.1 decides how `libs/board` joins lila's pnpm workspace; goban's image themes need a licence check before any ships.

### 2026-09-27 · 1.2 · Build-vs-buy: client-side rules, SGF and board (OGS goban spike)
- Did: spiked npm `goban`/`goban-engine` 8.3.226 (release commit 6276a50) and goban `main` (e61c56e) in a scratch folder: the engine in Node (ko, suicide, captures, superko settings, SGF in/out), goban's own engine tests, and the SVG board inside a snabbdom view bundled with lila's esbuild, played by Playwright on desktop and phone viewports; measured bundle sizes; looked at the Sabaki fallbacks. Wrote docs/build-vs-buy/client-board-and-rules.md; asked the owner A (npm, pinned) vs B (vendor source).
- Worked: 203/203 of goban's engine tests; ADR 0003's situational superko via per-game config under both rulesets; tap-to-preview + confirm through goban's own `submit_move`; captures and prisoner counts; no page errors on either viewport.
- Didn't work / dead ends: `npx yarn@1 install` and `npm rebuild` fail in goban's repo (npm refuses its `react` override); use the preinstalled `yarn`. The `canvas` native module has no prebuilt binary for Node 24: move it aside, the engine tests pass without it. `square_size: "auto"` rendered a 100 px board. Confirm threw `No last_clock when calling sendMove()` until `sendMove` was overridden. Setting `player_id` in an `update` handler is too late: set it before emitting the server's move event.
- Lessons: see the four 2026-09-27 lines in Lessons. The reviewer caught two memo errors before the PR: "no handicap table" (goban has one, and its Chinese preset switches to free placement) and goscorer's MIT notice missing from the COPYING plan. Grep upstream before any "it has no X" claim.
- Decisions: A vs B asked in the unit thread, pending (logs/decisions.md). ADR follows the answer.
  (Update 2026-09-28: the owner delegated all decisions; Claude chose A, ADR 0014.)
- Verified by Claude: the spike outputs, test run and screenshots quoted in the memo. · Needs owner verification: none technical; the choice itself.
- Follow-ups: 1.6/1.8 fixtures mark cycles longer than 30 moves as server-only (or offer OGS a patch making the limit configurable); the analysis board's SGF import reads `SZ`/`KM` itself; SGF download comes from the server; check the image themes' licences before shipping any; Phase 2 decides where `libs/board` sits in the pnpm workspace and lazy-loads the board.
