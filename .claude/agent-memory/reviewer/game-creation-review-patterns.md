---
name: game-creation-review-patterns
description: Unit 3.15 (game creation) review patterns - form-only rated gates bypassed by non-form paths (Setup.like updateFrom, rematches, stored records), kept chess rematch branch, vacuous me=None form tests
metadata:
  type: project
---

Found reviewing unit 3.15 (2026-09-30):
- "Casual only" gated in forms only; non-form paths copy `game.rated`: `HookConfig.updateFrom` (Setup.like,
  "new opponent"), `ChallengeMaker.toChallenge` rematch, `Rematcher`, plus pre-unit stored seeks/challenges/
  bulks with rated=Yes. Suggest a single clamp in `newGoGame` or at each call site.
- Rematcher kept `returnChess` after dropping the `!g.isGo` gate: legacy chess games still rematch as chess,
  contradicting "from here no chess games are created".
- Form tests with `given Option[Me] = None` make `mode(me.isDefined)` rated checks vacuous (old code already
  refused rated for anon). Ask for an authed Me or check the mapping directly.
- scalachess `Rated.default` is No (javap on `chess/Rated$package$Rated$.class`, 17.17.1).
- `./lila.sh -batch "a" "b"` runs only the first command via the thin client; run one per call.

**Why:** these were the gaps in 3.15; later units (5.7 rated on, 6.4 pools, 3.19 forms) touch the same paths.
**How to apply:** for any creation/rated change, grep every `rated =` assignment on creation paths, not just forms. See [[core-type-migration-review-patterns]].
