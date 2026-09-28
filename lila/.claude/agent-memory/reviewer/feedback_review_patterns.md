---
name: review-patterns
description: Recurring gaps found when reviewing LiGo units (asset/licensing strips, verify gate blind spots, compile warnings)
metadata:
  type: feedback
---

Patterns seen in LiGo unit reviews; check these every time.

- Asset-reference audits done by "grep path, check file exists" miss split or constructed paths
  (e.g. `loadSound('lisp/X')` + `.mp3`, `images/$x`) and non-file copies (the lichess logo lives on
  as the SVG spinner mask/paths in layout.scala, HtmlHelper.scala, ui/lib/src/view/controls.ts and as
  glyph e07a in public/font/lichess.sfd). Grep for content (path data, glyph names) too.
  **Why:** unit 3.1 (2026-09-28) claimed "every kept reference fixed" but missed these.
  **How to apply:** for any removal unit, grep dynamic prefixes and distinctive content, not only literal paths.
- `.claude/skills/verify/verify.sh` runs oxfmt only on changed `ui/` files, but CI runs
  `pnpm run check-format` over all of lila/ (e.g. `lila/bin/gen/*.mjs`). Run
  `lila/node_modules/.bin/oxfmt --check <file>` on changed non-ui JS/TS yourself.
- lila baseline is 17 `[warn]` lines (logs/upstream-fork.md Lessons); count `[warn]` in
  `.claude/state/verify/lila_compile.log` and flag new ones (Scala `-Wunused:all` catches leftover
  `given` imports after deleting attribute code).
- Licensing text: check claims like "all X are Noto/free" against generator inputs
  (e.g. `lila/bin/flair/custom.txt` lists non-Noto flairs).
