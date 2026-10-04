---
name: game-creation-review-patterns
description: Units 3.15/4.9 (game creation, setup/challenge forms) review patterns - form-only rated gates, kept chess rematch, vacuous me=None tests, new TimeControl cases missed by ui/challenge + PushApi, handicap rematch colour swap, sg byo-yomi speed formula
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


Found reviewing unit 4.9 (2026-10-04):
- A new challenge `TimeControl` case must be grepped in TS too: `ui/challenge/src/view.ts timeControl()` switch
  fell to '-' for `type: "byoyomi"`; `PushApi.challengeCreate/Accept` use `c.clock.isEmpty` as "not real-time".
- lila's `rematchAlternatesColor` always swaps colours; once handicap exists, a rematch hands the stones to the
  other player (ChallengeMaker and round Rematcher both copy `go.setup`).
- strategygames `ByoyomiClock.Config.estimateTotalSeconds` = limit + 60*inc + 25*periods*byoyomi (javap); docs
  and the UI's clockToSpeed(main, period) said "main + 40 periods". Check speed claims with javap.
- verify's `lila tests` (testQuick) said "No tests to run" for the edited setup/challenge modules: run testOnly.

**Why:** these were the gaps in 3.15; later units (5.7 rated on, 6.4 pools, 3.19 forms) touch the same paths.
**How to apply:** for any creation/rated change, grep every `rated =` assignment on creation paths, not just forms. See [[core-type-migration-review-patterns]].
