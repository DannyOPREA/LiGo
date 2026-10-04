# lila/ui/ in LiGo

lichess's frontend: a pnpm workspace of TypeScript packages (`ui/<package>/`), rendered with
snabbdom, styled with SCSS, bundled by the custom esbuild-based `ui/.build/` (`ui/build`).

- Build via `dev/ligo compile ui`; tests via `dev/ligo test ui` (vitest). Lint/format: `pnpm lint`,
  `pnpm check-format` from `lila/` (oxlint, oxfmt, stylelint). The format hook runs them per file.
- Packages: `ui/lib` shared code and CSS (`ui/lib/css/`), `ui/site` the global bundle, one package
  per page (`lobby`, `round`, `analyse`, `puzzle`, ...). A package's `package.json` has a `build`
  section naming its bundles.
- snabbdom: views are pure functions of controller state (`ctrl.ts` + `view.ts`); call `redraw()`
  after state changes rather than touching the DOM.
- Themes: SCSS variables and mixins from `ui/lib/css/abstract/`; light/dark/transparent themes are
  CSS variables, so don't hard-code colours.
- The board: OGS goban through `libs/board`'s `mountBoard` (`@ligo/board/board`, a workspace
  package since unit 2.1; see libs/board/README.md). chessground and chessops left in unit 3.19
  part 2; `@types/lichess/board.d.ts` keeps their `Color`/`Key`/`Role` type names. Load the board with
  `import()` so pages get it as a separate file; don't reimplement anything goban provides.
  `ui/playground` (unit 2.2) is the first page that mounts it: a local, no-server game whose
  `ctrl.ts` remounts the board (a fresh `key` on its container) for undo and "new game" rather than
  reaching into goban, and whose settings (size, ruleset, handicap, komi) come from `libs/board`'s
  `rules.mjs` (`handicapStones`, `standardKomi`).
- Page browser tests (unit 2.4): `ui/playground/e2e/` holds Playwright screenshots and a scripted
  game against the _built_ page (`dev/ligo compile ui`, then `dev/ligo test pages`), served from
  `public/` without a lila server. After a deliberate visual change, re-record with
  `--update-snapshots` and look at every changed picture before committing it. `ui/round/e2e/`
  (the game page, unit 3.18), `ui/analyse/e2e/` (the analysis board, unit 7.4) and `ui/puzzle/e2e/`
  (the puzzle trainer, unit 8.7) follow the same
  pattern. Build the whole UI first: a partial `ui/build <package>` leaves `public/compiled/manifest.json`
  pointing at older bundles.
- `ui/analyse` (unit 7.4) is the Go analysis board: lila's move tree (`ui/lib/src/tree`, generic
  over its node type) holding libs/board's Go nodes, `mountBoard` for positions and `mountEditor`
  for setup mode (ADR 0023).
- Dependencies: never non-frozen `pnpm install`; any `package.json` change needs an approved
  build-vs-buy memo (you will get a permission prompt).

## Logs to read

`logs/frontend.md`, `logs/board-ui.md`, `logs/lobby.md` (as relevant; Lessons + latest entries).
