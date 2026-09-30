# tools/puzzles

LiGo's tsumego pipeline (ADR 0024, ADR 0025, unit 8.3). It makes life-and-death puzzles of its
own, proves each answer by exact search, asks KataGo for a second opinion, and writes them in OGS
goban's own puzzle format, so goban's puzzle mode can play them (unit 8.5).

## How a puzzle is made

1. **A catalogue position** (`src/catalogue.ts`). An eye space from the catalogue (straight three,
   bent four, bulky five, rabbity six, and so on) is placed in the corner, on the edge or in the
   centre of a 19×19 board. The defender's stones surround it, and a solid wall of the attacker's
   stones surrounds those. One variation is applied: up to two stones inside the space, and up to
   two weak points (defender stones left out), at most three changes in all.
2. **The wall check** (`reject`). The solver only looks inside the region (the space plus the weak
   points), so a position is kept only if the rest can't matter: every attacker chain touching the
   region has 3 or more liberties outside it, the defender has none outside it, the defender's
   stones are one group, and there are at most 10 empty points.
3. **The solver** (`src/solver.ts`). Both sides play inside the region, or pass, on goban-engine
   with LiGo's rules. A line ends when a defender stone is captured (the attacker wins), when the
   group is unconditionally alive (Benson's test, `src/benson.ts`; the defender wins), or when
   both sides pass in a row (the defender survived, seki included). Ko lines are "unknown", and a
   position that depends on one is dropped.
4. **Unsettled only.** A position becomes a puzzle only if whoever moves first wins. The seed picks
   whether it is a "live" or a "kill" puzzle.
5. **The tree** (`src/tree.ts`): every winning move for the player, the opponent's most resisting
   replies, lines ending once the result can't change, and refutations of up to 6 wrong first
   moves.
6. **Difficulty** (`difficulty` in `src/generate.ts`): the right line's length, how hard the search
   was and how many wrong tries there are give a band (800, 1200, 1600, 2000) and a starting rating
   within ±150 of it. lila's puzzle Glicko then moves the rating as people play.
7. **KataGo's second opinion** (`src/katago.ts`). The board is filled with KaTrain's tsumego frame
   (`src/frame.ts`) so the problem decides the game. KataGo then plays on after each right move and
   each refutation, both sides kept in the region, and must read the group as the tree says. If it
   disagrees, the puzzle is dropped.
8. **`check`** (`src/puzzle.ts`): the JSON schema (`schema/puzzle.schema.json`), then every line
   replayed with LiGo's rules.

## Commands

From the repository root, in native mode (after `dev/ligo deps`):

```sh
dev/ligo puzzles build --out tools/puzzles/data/generated-001.json --seed 1 --count 240
dev/ligo puzzles check                        # every file in tools/puzzles/data/
dev/ligo puzzles gate                         # the feasibility gate (ADR 0025 §2)
dev/ligo puzzles sgf tools/puzzles/data/generated-001.json [ID] > puzzle.sgf
dev/ligo puzzles import problem.sgf meta.json # a hand-transcribed problem, as JSON
dev/ligo test puzzles
```

`build` needs KataGo (`dev/ligo katago install`); it uses the network `dev/ligo katago env` picks,
and records its name and sha256 in each puzzle. `LIGO_PUZZLES_VISITS` sets KataGo's visits (400).

## A puzzle file

A JSON array, one puzzle per line. Each puzzle is goban's `PuzzleConfig` (`width`, `height`,
`initial_state`, `initial_player`, `move_tree`, `puzzle_player_move_mode`,
`puzzle_opponent_move_mode`) plus LiGo's `id`, `bounds`, `goal`, `themes`, `rating` and
`provenance` (the generator's version and seed, the shape, variation and orientation, and the
KataGo check; or, for a transcribed problem, the work, edition, problem, scan and its rights line).

## Licence

MIT, code and puzzles alike (ADR 0007, ADR 0024). `src/frame.ts` is a port of KaTrain's MIT
tsumego frame; notices are in [NOTICE.md](NOTICE.md).
