# tools/puzzles/ in LiGo

The tsumego generator and pipeline (ADR 0024, ADR 0025, unit 8.3): catalogue eye spaces, an exact
local solver over goban-engine, goban's puzzle JSON with provenance, KataGo's second opinion, SGF
both ways. How it works: [README.md](README.md).

- **goban-engine decides every rule.** `src/goban.ts` is the only file that imports it; the
  solver plays and takes back moves on a `GobanEngine` with LiGo's settings (situational superko,
  no suicide). Never write a second capture or legality check.
- **The solver is only sound for what the wall check keeps** (ADR 0025 §2). It searches the region
  alone and treats the wall as alive, so `reject` in `src/catalogue.ts` must keep dropping: a wall
  chain touching the region with fewer than 3 liberties outside it, a defender with a liberty
  outside the region, a defender in more than one chain, more than 10 empty points. Don't loosen
  these to get more puzzles.
- **Ko is dropped, not solved.** A move that makes a ko, a superko refusal and a line past the depth
  limit are `unknown`; only definite values go into the transposition table (keyed on the region,
  passes in a row and the side to move). A puzzle whose tree would rest on an unknown line is
  dropped (`Dropped`). Ko puzzles need an explicit ko model first (ADR 0025 §2).
- **The tree follows ADR 0025 §1**: every winning player move is listed (goban marks anything off
  the tree wrong), the opponent's longest-resistance replies only, a line ends `correct_answer`
  once the opponent can't change the result even with two moves in a row, up to 6 refuted wrong
  first moves, at most 15 plies and 300 nodes, at most 3 right first moves.
- **Every puzzle passes `check`** (`src/puzzle.ts`: the JSON schema in `schema/`, then every line
  replayed with LiGo's rules) before it is written, and `dev/ligo test puzzles` checks every
  committed file. Change the schema and `Puzzle` together.
- **KataGo disagreeing drops the puzzle**, and the reason is logged. The cloud uses the pinned
  test network (weak); the exact search is what the set is trusted on.
- **Same seed, same candidates.** Randomness comes only from `random(seed)` in `src/generate.ts`, and
  the seed is in each puzzle's provenance. Don't use `Math.random` or the clock in anything that
  shapes a puzzle. KataGo's verdict and the solver's time limit still vary a little, so a rerun
  keeps nearly the same set (4 of 240 changed for seed 1, unit 8.4): commit a batch, never
  regenerate it in place.
- `src/frame.ts` is a port of KaTrain's MIT `tsumego_frame.py` (`LICENSE-katrain.txt`); keep its
  structure and names so the two can be compared, and `test/frame.test.ts`'s vectors (computed by
  the Python original) passing. lizgoban's own source is GPL-3.0: never read it for this file.
- **services/scoring and libs/board are imported by path** (`../../../services/scoring/src/katago.ts`,
  `../../../libs/board/src/sgf.mjs`), not as `workspace:*` packages: pnpm 12 linked a workspace
  package outside `lila/` to the wrong directory (logs/tsumego.md, unit 8.3). So installs filter
  all three packages (`dev/ligo`'s `puzzles_install`).
- No build step: Node 24 runs `.ts` directly, so **erasable TS only** (no `enum`, no parameter
  properties, no decorators). Packages: from `lila/`, `pnpm --filter @ligo/puzzles add --save-exact
  <pkg>@<version>`; `goban-engine` pinned to `libs/board`'s version. Runtime dependencies:
  `goban-engine`, `ajv` (the schema). A dependency change needs COPYING.md and `NOTICE.md`.
- Code and puzzle files are MIT (ADR 0007, ADR 0024).

- **Loading into lila** is `mongo/doc.js` (the file→document mapping, ADR 0025 §5) and
  `mongo/load.js`, plain mongosh scripts so docker mode needs no host Node. Keep `doc.js`'s field
  names in step with `lila/modules/puzzle`'s BSON reader.

## Test
`dev/ligo test puzzles` (native mode): typecheck, lint, `pnpm --filter @ligo/puzzles run test`
(the straight three's known answers, the catalogue and wall check, the frame against KaTrain's
vectors, every broken-puzzle case, SGF both ways through libs/board's reader, the generator's
determinism, and a real-KataGo check when `KATAGO_BIN`/`KATAGO_TEST_NET` are set), then
`puzzles check` over `data/`. CI: `.github/workflows/puzzles.yml` (`LIGO_REQUIRE_KATAGO=1`).
The feasibility gate: `dev/ligo puzzles gate` (ADR 0025 §2: 250 positions settled within 20 s each).

## Logs to read
`logs/tsumego.md` (Lessons + latest entries).
