# libs/board/ in LiGo

The browser's Go board and rules. Today (unit 1.8): OGS **goban-engine** (npm, pinned, ADR 0014)
built with LiGo's rule settings in `src/engine.mjs`, and the tests that hold it to the rules spec
and to the server. Phase 2 adds the board itself (goban's SVG renderer wrapped for snabbdom) and
decides how this package joins lila's pnpm workspace. How it works: [README.md](README.md).

- **We configure goban, we don't rewrite it.** Every engine is built by `createEngine` or
  `readSgf`, never with goban's own rule presets: situational superko in both rulesets, no suicide,
  komi always given, and handicap stones always passed in from the server (spec §9).
- The server is the referee (spec §9). goban-engine's two superko gaps (30-move window, starting
  position never compared) are the fixtures' `knownGaps.client`, not something to patch here.
- Truth is `libs/conformance/fixtures/` (only go-rules-expert edits them). Never change a fixture to
  make goban pass.
- Bumping goban-engine: change the exact version in `package.json` (`pnpm add --save-exact`), check
  its engine changes (upstream-scout), keep `NOTICE.md` and COPYING.md in step (goscorer is
  bundled inside and its notice is dropped by goban's build), run `dev/ligo test rules`. A version
  bump is a dependency change.
- Plain JavaScript modules with JSDoc, no build step, run by Node 24 (`.node-version`).

## Test
`dev/ligo test board` (engine tests + client fixtures). `dev/ligo test rules` runs the server's
tests first, which write `libs/go-rules/target/parity/server.json`, then all of this package's
tests including `test/parity.test.mjs`. CI: the `rules` job in `.github/workflows/rules.yml`.

## Logs to read
`logs/rules-engine.md` (Lessons + latest entries); `logs/board-ui.md` when the board work starts.
