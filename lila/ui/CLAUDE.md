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
- The board: chess uses chessground. Go will use OGS goban through `libs/board` (a thin adapter,
  planned). Wire it into round/analyse via that adapter; don't reimplement anything goban provides.
- Dependencies: never non-frozen `pnpm install`; any `package.json` change needs an approved
  build-vs-buy memo (you will get a permission prompt).

## Logs to read

`logs/frontend.md`, `logs/board-ui.md`, `logs/lobby.md` (as relevant; Lessons + latest entries).
