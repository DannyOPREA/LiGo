---
paths:
  - "lila/ui/**/*.ts"
  - "lila/ui/**/*.mts"
  - "libs/board/**/*.ts"
---
# TypeScript rules
- Strict TypeScript as configured in `lila/ui/tsconfig.base.json`; no `any` unless the surrounding
  code does the same and there's no better type.
- snabbdom idioms: views are pure functions of controller state; mutate state in the controller,
  then `redraw()`. No direct DOM manipulation outside hooks.
- Never reimplement what OGS goban provides (board rendering, stone placement, SGF, scoring
  overlays): wrap it in `libs/board`.
- Format/lint with lila's own oxfmt and oxlint config (the format hook does it on every edit).
- Reuse `ui/lib` helpers (xhr, i18n, storage, pubsub, dialogs) instead of writing new ones.
