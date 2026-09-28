# services/scoring/ in LiGo

The scoring service's core: KataGo's analysis engine, OGS **goban-engine**'s `autoscore` and
`GobanEngine.computeScore()` (goscorer), no Redis yet (ADR 0016, ADR 0020 §1, unit 4.4). How it
works: [README.md](README.md).

- **We call goban-engine, we don't rewrite it.** Every board comes from `src/board.ts`'s
  `parseBoard`/`initialState`, never a hand-built `GobanEngine` config; `src/goban.ts` is the only
  file that imports the package (as `libs/board/src/engine.mjs` is for the browser).
- **The service never replays moves.** It always gets the final board and the play-time prisoners
  from lila (ADR 0020 §1); it is never a second rules engine that could disagree with go-rules.
  Test fixtures are the one exception: a couple of libs/conformance's scoring cases give only a
  `handicap` and rely on the standard placement (R-HCP-4), which `test/handicap-points.ts`
  materializes for the harness only, never at runtime.
- **`dead` is always whole chains.** `src/chains.ts` widens a proposal to whole chains before
  counting, and rejects a `count` request whose `dead` isn't already whole chains with an `error`
  reply rather than silently widening it (ADR 0020 §1).
- **Handicap 0/1 never reaches goban-engine's `handicap` field as 1.** `effectiveHandicap` in
  `src/score.ts` clamps it to 0 below 2 stones (R-HCP-2, R-KOMI-3): goban-engine 8.3.226 would
  otherwise give White a free point of compensation for a 1-stone game
  (`test/handicap.test.ts`, `test/conformance.test.ts`'s `ligo-handicap-one-no-compensation-chinese`).
- **A `count` never asks KataGo** (ADR 0020 §1): its `seal` is always empty, since only autoscore's
  ownership-uncertainty heuristic can say a point still needs sealing.
- Truth is `libs/conformance/fixtures/` (only go-rules-expert edits them). Never change a fixture
  to make this package pass; `test/conformance.test.ts` replays every case whose `appliesTo`
  includes `"scoring"` through the `count` path.
- No build step: Node 24 runs `.ts` directly (type stripping), so source stays in **erasable TS
  syntax** only — no `enum`, no `namespace` with runtime code, no parameter properties, no
  decorators. `tsc --noEmit` (`pnpm run typecheck`) is the only check that needs a compiler.
- In lila's pnpm workspace (ADR 0017's reasoning, applied here too: one lockfile, `goban-engine`
  pinned to the exact version `libs/board` uses, so both sides of the wire share one copy of it).
  Add or bump packages from `lila/` with `pnpm --filter @ligo/scoring add --save-exact <pkg>@<version>`;
  the lockfile is `lila/pnpm-lock.yaml`. No third-party dependency beyond `goban-engine` and
  `typescript`/`@types/node` (dev only) — no Redis client until unit 4.5.
- Bumping `goban-engine`: change the exact version in `package.json` (from `lila/`, as above),
  keeping step with `libs/board`'s version (both packages must pin the same one), check its engine
  changes (upstream-scout), keep `NOTICE.md`/`test/autoscore_test_files/NOTICE.md` and COPYING.md
  in step, run `dev/ligo test scoring`. A version bump is a dependency change.

## Test
`dev/ligo test scoring` (native mode: typecheck, lint, then `pnpm --filter @ligo/scoring run test`).
Runs OGS's 31 autoscore regression games (`test/autoscore.test.ts`, must be 31/31), the
libs/conformance scoring fixtures (`test/conformance.test.ts`), board/chain/handicap unit tests,
the KataGo client against a fake `katago` process (`test/katago.test.ts`: fallback, timeout,
crash-and-restart), and, only when `KATAGO_BIN`/`KATAGO_TEST_NET` are set (as `dev/ligo katago env`
prints them), one real-KataGo test (`test/integration.test.ts`; otherwise skipped, not failed).
Docker mode: not yet (no KataGo in the ui container; unit 4.5 wires up supervision there). CI: the
`scoring` job in `.github/workflows/scoring.yml`.

## Logs to read
`logs/scoring.md` (Lessons + latest entries).
