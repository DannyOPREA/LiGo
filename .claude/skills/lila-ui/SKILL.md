---
name: lila-ui
description: How lila's frontend works - the ui/build system, pnpm packages, snabbdom patterns, SCSS themes, page bundles and the planned libs/board goban integration. Use whenever changing TypeScript or SCSS in lila/ui.
---

# Working in lila/ui

lila/ui/CLAUDE.md has the overview; the path rules cover style.

- **Build:** `dev/ligo compile ui` (runs `ui/build` with a frozen install). Each package's
  `package.json` has a `build` section listing its bundles and SCSS entry points; `ui/build`
  (esbuild + sass) writes to `public/compiled/` (generated: never edit).
- **Page bundles:** a page loads its package's bundle through the server-side view (look for the
  module name in `modules/*/src/main/ui/` or `app/views/`). New pages copy an existing small
  package (e.g. `ui/editor` or `ui/coordinateTrainer`).
- **snabbdom:** `ctrl.ts` holds state and actions, `view.ts` renders `h(...)` trees from state,
  and `redraw()` re-renders; DOM access only in snabbdom hooks.
- **Shared code:** `ui/lib/src` (xhr, i18n via `i18n.site.*`, storage, pubsub, socket, `view/dialog`). Reuse it.
- **Themes and CSS:** SCSS in each package's `css/`, shared abstract variables and mixins in
  `ui/lib/css/abstract/`; colours come from theme CSS variables.
- **Board:** OGS goban (chessground left in unit 3.19 part 2); LiGo uses it via `libs/board`'s `mountBoard`
  (`@ligo/board/board`, in lila's pnpm workspace; API in libs/board/README.md), mounted in a
  snabbdom `insert` hook and loaded with `import()`. Never reimplement goban behaviour in lila.
- **Tests:** vitest (`dev/ligo test ui`); lint/format with `pnpm lint`, `pnpm check-format`.
