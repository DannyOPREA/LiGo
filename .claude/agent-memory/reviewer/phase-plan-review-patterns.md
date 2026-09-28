---
name: phase-plan-review-patterns
description: What to check when reviewing a LiGo phase breakdown / module-map PR (PLAN §5 unit tables, ADR 0018-style keep/remove maps)
metadata:
  type: feedback
---

Checks that found real problems in the Phase 3 breakdown review (PR #20, 2026-09-28):

- **Open the POM of any artifact the plan says "stays when X goes".** `scalachess-rating_3` POM
  depends on `scalachess_3`, and its glicko `Game` class uses `chess.ByColor`/`chess.Outcome`
  (checked with `strings` on the jar in /root/.cache/coursier). "Separate artifact" != independent.
- **Script the build graph**: parse `lila/build.sbt` `module("x", Seq(deps))` and check both build
  deps AND code-level `lila.<removed>` imports in kept modules (mod used `lila.game`/`lila.analyse`
  only transitively via `evaluation`).
- **"Remaining modules" lists are rarely exhaustive**: grep `chess\.` per module, filter out
  "lichess.org" false positives; common, ui, chat, socket, user, rating, mailer and `app/` use
  scalachess generic types (ByColor, Centis, IntRating, PlayerTitle).
- **UI packages**: check kept packages' package.json `workspace:*` deps and imports of removed ones
  (round/puzzle import `voice`; analyse depends on `keyboard-move` and `editor`) -> lockfile change.
- **Needs column**: core-type migration units must need all removal units, or removed modules must be
  migrated too. Compare against PLAN §3.4's stated order.
- Recount any number quoted in logs/decisions.md against the ADR table.

**How to apply:** any future phase breakdown (4-9) or module/package map.
