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
- The board: chess uses chessground. Go uses OGS goban through `libs/board`'s `mountBoard`
  (`@ligo/board/board`, a workspace package since unit 2.1; see libs/board/README.md). Load it with
  `import()` so pages get it as a separate file; don't reimplement anything goban provides.
  `ui/playground` (unit 2.2) is the first page that mounts it: a local, no-server game whose
  `ctrl.ts` remounts the board (a fresh `key` on its container) for undo and "new game" rather than
  reaching into goban, and whose settings (size, ruleset, handicap, komi) come from `libs/board`'s
  `rules.mjs` (`handicapStones`, `standardKomi`).
- Dependencies: never non-frozen `pnpm install`; any `package.json` change needs an approved
  build-vs-buy memo (you will get a permission prompt).

## Logs to read

`logs/frontend.md`, `logs/board-ui.md`, `logs/lobby.md` (as relevant; Lessons + latest entries).
