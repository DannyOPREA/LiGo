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
- verify.sh doesn't run `dev/ci/meta_checks.py` (logs, manifests). Removal units that delete
  `ui/*/package.json` or touch `lila/pnpm-lock.yaml`/`build.sbt` fail CI `meta` unless COPYING.md
  changes too, even for pure removals. **Why:** unit 3.2 (2026-09-28) logged "lockfile removals
  aren't a dependency change" and left COPYING.md untouched. Check the MANIFEST regex every time.
- sbt 2 remote cache: `.claude/state/verify/lila_tests.log` can show "Passed: Total 0" for every
  module and 0 compile `[warn]` (cache hits replay nothing), so it isn't evidence tests ran or that
  warnings are gone. Ask for a non-cached run or say it's unverified.
- Removal units leave orphans outside the deleted package: `ui/bits/src/bits.<feature>*.ts` and
  `ui/bits/css/build/bits.<feature>.scss` entries whose only `Esm(...)`/`.css(...)` caller was
  deleted. Grep deleted Scala (`git show HEAD:<file>`) for Esm/css names and check each still has a caller.
- Before running verify.sh, `ps -eo pid,args | grep verify.sh`: the main session often runs it at
  the same time. Two runs share one sbt server and the same `.claude/state/verify/*.log` files, so
  both get spurious failures (e.g. "error while loading X.tasty"). Wait for the other run to end
  (background until-loop on its pid), then run yours. (2026-09-30, unit 3.19 review.)
- verify.sh's ui gates don't type-check: `dev/ligo test ui` is node tests only, oxlint runs without
  `--type-aware`, and `ui/build`'s tsc only covers `*/tsconfig*.json` (not `*/tests/`). Run
  `node lila/ui/.build/node_modules/typescript/bin/tsc -p lila/ui/<pkg>/tsconfig.json --noEmit` and
  `oxlint --type-aware <files>` yourself; check new `tests/` dirs have the `tests/tsconfig.json` others have.
- Licensing text: check claims like "all X are Noto/free" against generator inputs
  (e.g. `lila/bin/flair/custom.txt` lists non-Noto flairs).
