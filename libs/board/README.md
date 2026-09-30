# libs/board: the browser's Go board and rules

The server decides which moves are legal (libs/go-rules, strategygames). The browser needs the same
answers without asking the server each time: to preview a move, to mark the ko, and later for the
analysis board and tsumego. It gets them from OGS's **goban-engine** (the engine-only build of
`goban`, pinned at 8.3.226, ADR 0014). This folder is where LiGo sets it up and proves it agrees
with the server, and, since unit 2.1, where goban's board itself is wrapped for lila's pages.

## The board (`src/board.ts`, unit 2.1)

goban's SVG board, wrapped behind a small API in the style of lila's chessground: a snabbdom view
mounts it in an `insert` hook and destroys it in `destroy`, and never touches goban itself.

```ts
import { mountBoard } from '@ligo/board/board';

const board = mountBoard(el, {
  size: 19, ruleset: 'japanese', komi: 6.5, // handicap games also pass `handicap` and `stones`
  moves: ['pd', 'dp'],       // already played
  movable: 'black',          // 'white' | 'both' (a local game) | 'none'
  confirm: false,            // true: a tap previews, board.confirm() (or a mouse double click) plays
  onMove: move => send(move),            // the player picked a legal move: 'dd' or 'pass'
  onRefused: reason => {},               // 'occupied' | 'suicide' | 'superko'
  onPlayed: ({ move, color, captured }) => {}, // each move that counted, from `play` (sounds, ADR 0026)
  theme: { board: 'Book', stones: 'Slate & Shell' }, // optional, default Plain / Plain
  onChange: () => redraw(),
});
board.play('qf');   // a move that counts: the player's, once accepted, or the opponent's
board.cancel();     // the player's move didn't count: take it back
board.pass();  board.pending();  board.confirm();  board.set({ movable, confirm });
board.state();      // { board, toMove, captures, koPoint }, as in engine.mjs
board.destroy();
```

- **The page decides which moves count.** A click is only reported (`onMove`); the stone stays a
  preview until `play` (or goes with `cancel`), and the board takes no other move (stone or pass)
  until then. A local page plays it back at once; a game page waits for the server. Moves from the
  other side also come in by `play`.
- **`play` trusts its caller**, which is the referee: goban plays what it is given, a suicide too
  (a malformed move throws; one on an occupied point changes nothing). Clicks on a stone are
  ignored, so `onRefused` reports suicide and superko. Two passes don't end play here: the
  scoring phase comes with the game page (Phase 4).
- **Confirm mode is goban's.** A tap shows a preview stone; the page's confirm button
  (`board.confirm()`) plays it. A second tap on the preview takes it back, and a tap elsewhere
  moves it; a mouse double click plays at once. goban ignores double taps on touch screens, so
  phones need the page's button.
- **Sized by its box.** The board is as wide as `el` (the page's CSS sets that) and follows it
  when it changes size. goban draws in a child of `el`, inside a shadow root.
- **Themes drawn from code only** (ADR 0026 §3). `theme: { board, stones }` picks one of goban's
  picture-free boards (Plain, Book, Night Play, HNG, HNG Night) and stone pairs (Plain, Slate &
  Shell, Glass, Worn Glass, Night); `board.set({ theme })` changes it on a mounted board. The lists
  are in `src/themes.ts` (`@ligo/board/themes`), which a page can import without loading goban.
  goban's wood, granite and anime themes load pictures from OGS's CDN with no stated licence, and
  any name not in the lists becomes Plain, so the board never fetches anything.
- **Keyboard and screen readers** (unit 9.4, ADR 0026 §4, `src/access.ts`). The board is a
  focusable `role="application"`: arrows, Home/End and Page Up/Down move a cursor (shown only on
  keyboard focus), Enter or Space plays there as a tap would (with `confirm`, again to play), P
  passes, D reads the point and its neighbours. A polite live region reads out each move `play`
  plays ("Black D4, 1 stone captured", "White passes"), refusals ("Illegal: ko") and the point
  under the cursor, with the names printed on the board (letters without I). English for now.
- **Same rules as the engine.** The board takes its settings from `src/rules.mjs`, the ones
  `createEngine` uses (superko, no suicide, komi, the server's handicap stones), and nothing in
  `src/` imports goban-engine next to goban, so a page bundles goban's engine once. The bundle
  is about 100 KB gzipped (404 KB minified): pages should load it lazily, with `import()`, which
  lila's esbuild splits into its own file.
- **How it works inside.** goban's play mode expects OGS's server. `LigoGoban` overrides the one
  method that sends moves (`sendMove`), and a stand-in socket hands `play` to goban's own code for
  arriving moves. goban only lets the player to move place stones (`player_id`); the adapter keeps
  that id in step with `movable` and the turn.

## The rules engine (`src/engine.mjs`, unit 1.8)

```js
import { createEngine, play, tryMove, stateOf, readSgf } from "./src/engine.mjs";

const e = createEngine({ size: 9, ruleset: "japanese", komi: 6.5 }); // handicap games also pass `stones`
play(e, "ee");      // null when played, else "occupied" | "suicide" | "superko"
tryMove(e, "ee");   // the same answer without playing
stateOf(e);         // { board: [".X.."...], toMove, captures: { black, white }, koPoint }
readSgf(sgfText);   // an engine at the end of an SGF record's main line
```

`src/rules.mjs` (shared by the board and the engine, no goban import) also exports the two things a
page needs to start a game without a server: `handicapStones(size, n)` (R-HCP-4's fixed placements;
throws for 13×13, which has no table yet, R-SCOPE-1) and `standardKomi(ruleset, handicap)` (R-KOMI-1/2,
before any Chinese compensation, which `gameConfig` applies from `handicap`). Unit 2.2's playground
is the first caller.

## SGF for the analysis board (`src/sgf.mjs`, unit 7.2, ADR 0023)

```js
import { readTree, writeTree, playFrom, decodeSgf } from "@ligo/board/sgf";

const root = readTree(sgfText);   // the whole tree: variations, comments, glyphs, kept properties
root.settings;                    // { size, ruleset, komi, handicap, black, white, toMove }
root.children[0];                 // { id: "pd", ply: 1, move, color, stones, captures, ko, toMove, ... }
playFrom([root, ...line], "dd");  // { node } for a new move, or { refused }
writeTree(root);                  // the tree as an SGF record, root included
decodeSgf(fileBytes);             // a file's text (UTF-8, or the charset its CA names)
```

The text is `@sabaki/sgf`'s job (parse and stringify); every move is replayed through `play`, so a
position never comes from the file and an illegal move, a move out of turn or an off-board point
refuses the record with its move number (`SgfError`). goban-engine's own SGF reader (`readSgf`
above) stays for the unit 1.8 read-back only: it hangs on a truncated file. Node ids are the move
itself (`"pd"`, `".."` for a pass), the two characters lila's tree paths need. The root's settings
follow `libs/conformance/sgf/root.json`, which the server's reader (unit 7.3) replays too, with
`records.json` for whole files. Before `@sabaki/sgf` sees the text, `recordOf` checks it against
the grammar the server's reader uses, so @sabaki/sgf's leniency never decides what a file means:
the first game only (text before its `(;` and after its end is ignored), names of ASCII letters
with a capital and a value, no node after a variation. Limits: 200 KB (UTF-8 bytes), 10,000 nodes
and 1,000 nested variations; setup stones only at the start, and no move in the first node; no
setup chain without liberties; 9×9, 13×13 and 19×19; `tt` is a pass on 19×19 only. `@sabaki/sgf` is patched
(`patches/`) with a `browser` field so bundlers leave out its Node-only file and charset modules.

## What LiGo sets that goban's presets would get wrong

| Spec rule | goban-engine's own preset | `src/engine.mjs` |
|---|---|---|
| R-KO-1 situational superko in both rulesets | Japanese: superko off ("no result"); Chinese: positional | `allow_superko: false`, `superko_algorithm: "ssk"` |
| R-HCP-4 fixed handicap stones | Chinese switches to free placement; places its own stones | The server's stones as the starting position, White to move |
| R-KOMI komi | Its own defaults; cuts komi to 0.5 in handicap games | Always given explicitly |
| R-KO-4 the ko point | None | Worked out from the last move |
| SGF records: size, komi, player to move | Ignored by its SGF reader, which also never reports a broken record | Read from the record's root and passed in; broken records and moves out of turn refused |

Known gaps, left as they are (the server is the referee, spec §9): goban-engine's superko looks back
only 30 moves and never at the starting position. The fixtures mark the five cases that show it
(`knownGaps.client`); the harness runs them as expected failures and says when one starts passing.

## Tests (`dev/ligo test rules`)

- `test/board.browser.test.mjs`: the board in Chromium (Playwright), bundled by esbuild from
  `test/browser/harness.ts`: clicks and phone taps reported and played back, captures, refusals
  (suicide, ko), previews, cancel, one colour or both, confirm, pass, handicap, sizing and
  resizing, destroy, themes, keyboard play and what the live region says, axe-core's WCAG 2.2 AA
  check, and no images or network requests. Chromium comes from `$LIGO_CHROMIUM`, the
  cloud sessions' `/opt/pw-browsers/chromium`, or `pnpm exec playwright install chromium`.

- `test/conformance.test.mjs`: every `libs/conformance` fixture that applies to the client, under
  each ruleset it names (both when none): 95 cases, 189 runs, 10 of them known gaps (5 cases).
- `test/parity.test.mjs`: replays what the server wrote (`libs/go-rules`' `ParityExportTest`):
  - SGF round trip: each of the 227 server fixture games, as the SGF the server writes, read back
    here ends in the same position, with the same legal and illegal moves;
  - 80 seeded random games (9×9, 13×13, 19×19; some with handicap; passes and resumes included):
    after every one of 16,100 actions the same stones, captures, player to move and ko point, and
    at probed plies the same answer, with the same reason, for every empty point.
- `test/sgf.test.mjs`: the root table (`libs/conformance/sgf/root.json`), the `sgf` skill's quirks,
  variations, comments and glyphs, refusals (a truncated file, moves out of turn, a ko retake,
  deep nesting, too long), read → write → read round trips, `playFrom`, charsets, and that the
  reader bundles for the browser. `test/parity.test.mjs` also reads the 227 server SGF games with
  `readTree` and checks they end in the server's position, and 4,000 seeded broken records with
  the server import's verdicts (unit 7.3): the two SGF readers must agree on each.
- `test/engine.test.mjs`: the settings above, SGF glue, refusal reasons, and goban's own handicap
  table against R-HCP-4.

`dev/ligo test board` runs the engine, fixture and browser tests without the server; docker mode
skips the browser tests (the ui container has no Chromium). The `lint` and `typecheck` scripts
check `src/board.ts` with lila's oxfmt, oxlint and TypeScript settings.

## Packages

libs/board is a member of lila's pnpm workspace (`lila/pnpm-workspace.yaml`, unit 2.1, ADR 0017): its
packages are pinned in `lila/pnpm-lock.yaml`. `pnpm install --frozen-lockfile --filter @ligo/board
--filter lila`, run in `lila/`, installs them with lila's own oxfmt and oxlint, which the board is
linted with (what `dev/ligo` and CI do). Run its scripts from `lila/` too, as
`pnpm --filter @ligo/board run <script>`.
