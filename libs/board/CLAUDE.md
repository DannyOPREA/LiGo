# libs/board/ in LiGo

The browser's Go board and rules: OGS **goban-engine** (npm, pinned, ADR 0014) built with LiGo's
rule settings (`src/rules.mjs`, `src/engine.mjs`, unit 1.8), and goban's SVG board behind a small
chessground-like API (`src/board.ts`, `mountBoard`, unit 2.1), with the tests that hold them to the
rules spec, to the server and to a real browser. How it works: [README.md](README.md).

- **We configure goban, we don't rewrite it.** Every engine is built by `createEngine` or
  `readSgf`, never with goban's own rule presets: situational superko in both rulesets, no suicide,
  komi always given, and handicap stones always passed in from the server (spec §9).
- The server is the referee (spec §9). goban-engine's two superko gaps (30-move window, starting
  position never compared) are the fixtures' `knownGaps.client`, not something to patch here.
- Truth is `libs/conformance/fixtures/` (only go-rules-expert edits them). Never change a fixture to
  make goban pass.
- Bumping goban and goban-engine (always together, same version): change the exact versions in
  `package.json` (from `lila/`, as above), check
  its engine changes (upstream-scout), keep `NOTICE.md` and COPYING.md in step (goscorer is
  bundled inside and its notice is dropped by goban's build), run `dev/ligo test rules`. A version
  bump is a dependency change.
- **SGF is `src/sgf.mjs`** (ADR 0023): `@sabaki/sgf` reads and writes the text, every move is
  replayed through `play`. Don't use goban-engine's SGF reader for new code (it hangs on broken
  files); `readSgf` stays for unit 1.8's read-back test. `src/sgf.d.mts` types it by hand.
- **Lila's pages only see `mountBoard` and `mountPuzzle`** (`src/puzzle.ts`, goban's puzzle mode,
  unit 8.5). Nothing in lila imports goban; the board reports the
  player's move and the page (or server) decides by `play` or `cancel`. Only goban's themes
  drawn from code (`src/themes.ts`, ADR 0026 §3); its picture themes load unlicensed pictures from
  OGS's CDN, and any other name falls back to Plain (`gobanThemes`).
- **Keyboard and live region** (`src/access.ts`, ADR 0026 §4): keys drive goban's own `tapAt`, so
  a key does exactly what a tap does; don't re-create previews or legality for the keyboard.
- `src/board.ts` is TypeScript in lila's style (lila's tsconfig, oxfmt, oxlint: `pnpm run lint`,
  `pnpm run typecheck`); the rest is plain JavaScript modules with JSDoc, no build step, run by
  Node 24 (`.node-version`). `src/rules.d.mts` types `src/rules.mjs` by hand: change both together.
- In lila's pnpm workspace (unit 2.1): add or bump packages from `lila/` with
  `pnpm --filter @ligo/board add --save-exact <pkg>@<version>`; the lockfile is `lila/pnpm-lock.yaml`.

## Test
`dev/ligo test board` (engine tests, client fixtures, the board in Chromium). `dev/ligo test rules`
runs the server's tests first, which write `libs/go-rules/target/parity/server.json`, then all of
this package's tests including `test/parity.test.mjs`. Docker mode skips the Chromium tests. CI:
the `rules` job in `.github/workflows/rules.yml`.

## Logs to read
`logs/board-ui.md` for the board, `logs/rules-engine.md` for the engine (Lessons + latest entries).
