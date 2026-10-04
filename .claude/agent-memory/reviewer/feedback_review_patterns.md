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
  warnings are gone. Run them for real: `cd lila && ./lila.sh --server --batch "challenge/testFull"
  "setup/testFull" ...` (sbt 2's `testFull` skips the cache; worked 2026-10-04, ~2 min for 6 modules).
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
- docs/UPSTREAM.md's modification register (AGPL §5(a)) has rows only for units 0.2, 3.1–3.7,
  5.2, 5.3, 6.2, 6.4 as of 2026-09-30: units editing lila/ (3.8, 3.10–3.16, 5.4 part 1, 2.x, 9.x…)
  shipped without rows. Check `grep -o "unit X" docs/UPSTREAM.md` for the unit AND its earlier parts.
  New files under lila/ whose header says "MIT (COPYING.md §2)" need a COPYING.md row like
  GoRating.scala's, since COPYING §1 makes lila/ AGPL by default. (2026-09-30, unit 5.4 part 2.)
- lila "game started" rules: games are `.start`ed at pairing (status 20) and aborted (25) before
  2 plies; `NoStart` (37) only for mandatory/noAbort games, and PerfsUpdater skips < 2 plies, so a
  "has a started rated game" query that only excludes Aborted locks players out on NoStart.
- lila has TWO rematch paths: round's `Rematcher.returnGame` (the in-game button, swaps colours via
  `rematchAlternatesColor`) and challenge's `ChallengeMaker.makeRematchOf` (bots/API). Rules added to
  one (e.g. unit 4.9's "handicap rematch keeps colours") get missed in the other. Check both.
- `Challenge.toFriend` (POST /challenge/:id/to-friend) re-targets ANY of the caller's challenges via
  `setDestUser`, even one that already has a destUser. Any rule computed from the opponent at send
  time (rated handicap stones/colour, unit 5.7) can be bypassed there. (2026-10-04, unit 5.7 review.)
