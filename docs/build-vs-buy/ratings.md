# Build-vs-buy: ratings, kyu/dan ranks and handicap

- Unit: 1.4 (Phase 1). Status: **Open: waiting for the owner's choice.**
- Date: 2026-09-27. Evidence gathered in a throwaway spike outside the repo (code and output below).

## Capability

This is the PLAN §3.1 row "Ratings" and §3.7 "Ratings, ranks and handicap": after every rated game,
update both players' ratings; show each rating as a kyu/dan rank (with "?" while it's uncertain);
turn a self-declared starting rank into a starting rating; and, because LiGo has **rated handicap
games**, give the weaker player's result the right weight when they had stones or komi on their side.
Already decided: Glicko-2, one overall pool, ranks from OGS's curve ([ADR 0004](../decisions/0004-ogs-rank-curve.md)).

Out of scope here: how many stones auto-handicap gives and the cap (a Phase 5 lobby rule), komi values
(the rules spec, unit 1.5), and the tsumego rating (lila's puzzle module, Phase 8).

## What the plan proposed

scalachess's Glicko-2 (MIT), plus OGS's published rank curve and handicap adjustment ("a few formulas
from `goratings`") written as glue.

## What the spike found

Checked on 2026-09-27 against lila's own `scalachess-rating` **17.17.1** (the version lila already
uses), OGS's `goratings` at commit `6cab309` (2024-05-24, MIT) and OGS's frontend
`src/lib/rank_utils.ts` at `d94be54` (2026-09-26, AGPL-3.0).

1. **lila already has the Glicko-2 engine; nothing to add.** `scalachess-rating` is in lila's build
   (`lila/project/Dependencies.scala`) and `lila/modules/rating` wraps it: storage, deviation that
   grows while a player is inactive (`Glicko.liveDeviation`, 0.21436 rating periods per day), "?" for
   provisional ratings, rating graphs, leaderboards, lobby rating ranges. Its calculator takes the
   Glicko-2 system constant (tau) as a parameter.
2. **Configured like OGS, it gives OGS's numbers exactly.** With tau = 0.5 (goratings' value) and the
   standard Glicko-2 step 6, scalachess's one-game update matches goratings' `glicko2_update` to all 6
   printed decimals on 5 test cases (rating, deviation and volatility). With lila's own settings
   (tau 0.75, and lila skips the step-6 deviation increase after each game) the new ratings differ by
   less than 0.5 points and the deviations by up to 0.9 on the same cases.
3. **goratings is not a library we can call.** Its published package (`goratings/math`) only holds
   Glicko-2 and EGF's GoR in Python. The rank curve and handicap maths live in its `analysis/`
   scripts (`analysis/util/RatingMath.py`). So "reuse goratings" means porting about 40 lines of
   formulas. The spike did that in Scala: on a 90-case grid (9×9/13×13/19×19 × Japanese/Chinese ×
   komi 0.5/6.5/7.5 × 0/1/2/5/9 stones) the port gives **identical** results to OGS's Python.
4. **The rank curve in ADR 0004 is confirmed.** `rank = ln(rating / 525) × 23.15` in both goratings
   (its default "log" ranking) and OGS's frontend, with ratings clamped to 100–6000 first. Rank 30 is
   1d; below that the label is `ceil(30 − rank)` kyu, from 30 up `floor(rank − 29)` dan. So 1500
   (the usual starting rating) shows as 6k, 1950 as 1d, 2400 as 6d.
5. **OGS has two handicap formulas.** goratings' (used for rating updates) turns handicap, komi,
   ruleset and board size into a fractional rank difference: one stone is worth 12 points of
   territory (13 under area scoring), "fair" komi is 6 (territory) or 7 (area), and a stone counts
   as 3 ranks on 13×13 and 6 on 9×9. The frontend's is simpler: `rank + stones`. PLAN §3.7 ("depends
   on board size and ruleset") is the goratings one. Its quirk: a 1-stone handicap is just "no
   komi", worth ½ rank on 19×19.
6. **Handicap fits lila's calculator without changing it.** OGS updates each player against the
   opponent's *effective* rating (shifted in rank space, so the rating shift is asymmetric).
   scalachess updates both players in one call, so the glue calls it twice, once per player with
   the opponent shifted, and keeps that player's result. Doing so reproduced goratings' own
   one-game-at-a-time script exactly (below). scalachess's built-in `ColorAdvantage` is a fixed
   symmetric shift per calculator, so it isn't the right tool here.
7. **The handicap adjustment matters.** In the spike's 4-stone game (4.5k beats 0.5d on 19×19,
   Japanese, komi 0.5) the winner gains 22.5 points with the adjustment and 31.8 without it.
8. **What OGS runs in production can't be checked.** OGS's rating server code is closed; goratings
   calls itself "the (future) official" system and `RatingsV6.md` marks the handicap/komi/ruleset
   adjustment "approved, implemented". Its next step (widening the opponent's deviation for large
   handicaps, goratings PR #70) is marked "not landed", and this memo doesn't adopt it.
9. **PlayStrategy (our rules source) does no handicap rating.** Its lila fork keeps one Glicko-2
   pool per Go board size and rates handicap games like even ones. That contradicts two decisions
   already made (one pool, rated handicap), so it isn't a candidate.

## Candidates

| Option | Ladder rung | Licence | Maintenance | Fit with lila | Effort | OGS handoff value |
|---|---|---|---|---|---|---|
| **A. lila's Glicko-2 as-is, configured like OGS, plus ported goratings formulas** | 2–3 (configure + wrap) with a small port | MIT (scalachess, goratings); our glue MIT | lichess maintains the engine | Exact: it's lila's own code path | Low: a rank/handicap object of ~60 lines and a few constants | High: same numbers as OGS |
| A2. Same, keeping lila's own Glicko-2 settings | 2–3 | MIT | as A | Exact | Low (same code, fewer constants) | Medium: within a point of OGS per game, drifting over many games |
| B. Port goratings' whole Glicko-2 to Scala too | 5 (port) | MIT | Us | Replaces the engine lila's rating module is built around | Medium, for no gain: A already matches it exactly | High |
| C. Run goratings (Python) as a service | 1 (as-is) | MIT | OGS | Poor: a network call per game, and the formulas we need aren't in its package | Medium | High |
| D. EGF's GoR (in goratings) or per-size pools like PlayStrategy | — | MIT | — | Good | Low | Low; contradicts the Glicko-2 / one-pool decisions |

### What A and A2 set (the differences are all parameters)

| Setting | OGS (goratings) | lila today | A | A2 |
|---|---|---|---|---|
| Glicko-2 tau | 0.5 | 0.75 | 0.5 | 0.75 |
| Deviation increase in each update (Glicko-2 step 6) | yes | skipped | yes | skipped |
| "?" (provisional) while deviation ≥ | 160 | 110 | 160 | 110 |
| Deviation floor / ceiling | 30 / 500 (package), 10 / 500 (analysis runs) | 45 / 500 | lila's 45 / 500 | 45 / 500 |
| Rating floor / ceiling | 100 / 6000 | 400 / 4000 | lila's 400 / 4000 | 400 / 4000 |
| Inactivity | ages deviation over time (period configurable) | 0.21436 periods/day | lila's | lila's |

Keeping lila's floors and ceilings avoids touching lila's storage checks; 400 is below 30k (525)
and 4000 is far above 9d (about 2800), so no real player is affected. Starting ratings for the
self-declared rank use the inverse curve with a deviation of 250, as OGS's frontend does.

### What each option gives and costs

**A.** Gives: no new dependency (`scalachess-rating` is already in lila); OGS-identical rating
updates and ranks, so a LiGo 5k means the same as an OGS 5k and a later OGS handoff can carry
ratings across. Commits LiGo to: a small `GoRank` / handicap object in `lila/modules/rating` with
goratings' MIT notice; the twice-per-game call in lila's `PerfsUpdater`; three lila constants
changed for Go (tau, step 6, the "?" threshold). Risk: lichess tuned its settings for chess,
while OGS's were developed against at least 12 million ranked OGS games (goratings' README), so for
Go OGS's are the better-evidenced choice. The kyu/dan label rule comes from OGS's AGPL frontend; it is
a two-line formula, so the glue is written from this memo rather than copied, keeping it MIT
([ADR 0006](../decisions/0006-mit-for-own-code.md)).

**A2.** Gives: one fewer set of changes to lila's constants. Costs: ratings slowly diverge from
what the same results would give on OGS (the spike saw up to 0.9 deviation points per game, and
tau affects how fast volatility reacts), and "?" disappears after fewer games than on OGS.

## Recommendation

**Option A.** It's the plan's choice, and the spike shows it costs nothing extra: lila's engine,
configured with OGS's two Glicko-2 settings, already produces OGS's numbers to six decimals, and the
rank curve and handicap maths port cleanly and match OGS's code on every case tried. The only
custom code is the ~60-line glue the plan expected.

**Runner-up: A2**, if you'd rather leave lila's tuning alone; it can be switched to A later by
changing constants (ratings earned before the switch stay as they were).

## What the owner must decide

Use lila's Glicko-2 with OGS's settings and OGS's rank and handicap formulas (A, recommended), or
the same formulas with lila's own Glicko-2 settings (A2)?

## Spike evidence

A throwaway sbt 2.0.9 / Scala 3.8.4 project (lila's versions) with one dependency,
`"com.github.lichess-org.scalachess" %% "scalachess-rating" % "17.17.1"`.

```scala
// GoRating.scala: goratings' RatingMath.py (MIT, online-go/goratings @ 6cab309), ported
object GoRating:
  val A = 525.0
  val C = 23.15
  def rankToRating(rank: Double): Double = A * math.exp(rank / C)
  def ratingToRank(rating: Double): Double = math.log(rating / A) * C

  enum Rules:
    case Japanese, Chinese

  def handicapRankDifference(handicap: Int, size: Int, komi: Double, rules: Rules): Double =
    val extraMoves = if handicap > 1 then handicap - 1 else 0
    val (areaBonus, scoringBonus) = rules match
      case Rules.Japanese => (0, 0)
      case Rules.Chinese  => (1, handicap)
    val fullKomi = komi + scoringBonus
    val perfectKomiTerritory = 6
    val perfectKomi = perfectKomiTerritory + areaBonus
    val stoneValueTerritory = perfectKomiTerritory * 2
    val stoneValue = stoneValueTerritory + areaBonus
    val blackHeadStart = perfectKomi - fullKomi + stoneValue * extraMoves
    size match
      case 9  => blackHeadStart * 6 / stoneValueTerritory
      case 13 => blackHeadStart * 3 / stoneValueTerritory
      case _  => blackHeadStart / stoneValueTerritory

  def handicapAdjustment(black: Boolean, rating: Double, handicap: Int, size: Int, komi: Double, rules: Rules): Double =
    val d = handicapRankDifference(handicap, size, komi, rules)
    val eff = if black then ratingToRank(rating) + d else ratingToRank(rating) - d
    rankToRating(eff) - rating

  def label(rating: Double, deviation: Double, provisionalCutoff: Double = 160): String =
    if deviation >= provisionalCutoff then "?"
    else
      val r = math.log(math.min(6000, math.max(100, rating)) / A) * C
      if r < 30 then s"${math.ceil(30 - r).toInt}k" else s"${math.floor(r - 29).toInt}d"
```

```scala
// Spike.scala (excerpt): one player's update against an (adjusted) opponent
def update(calc: GlickoCalculator, me: Player, opp: Player, meWon: Boolean, skip: Boolean): Glicko =
  val outcome = Outcome(Some(if meWon then Color.White else Color.Black))
  calc.computeGame(Game(ByColor(me, opp), outcome), skipDeviationIncrease = skip).get.white.glicko

val ogsLike  = GlickoCalculator(tau = Tau(0.5))                                  // skip = false
val lilaLike = GlickoCalculator(ratingPeriodsPerDay = RatingPeriodsPerDay(0.21436d)) // skip = true, as lila's PerfsUpdater
```

The same cases went through OGS's own Python (`goratings.math.glicko2.glicko2_update`, and
`analysis/util/RatingMath.py` loaded directly, `--ranks log`, tau 0.5, no aging).

Plain Glicko-2, one game each (me rating/deviation/volatility vs opponent, result):

| Case | goratings (Python) | scalachess, OGS settings | scalachess, lila settings |
|---|---|---|---|
| 1500/350/.06 beats 1500/350/.06 | 1662.310894 / 290.318964 / 0.060000 | 1662.310894 / 290.318964 / 0.060000 | 1662.212001 / 290.230508 |
| 1500/200/.06 loses to 1400/30/.06 | 1387.257645 / 175.402669 / 0.060001 | 1387.257645 / 175.402669 / 0.060001 | 1387.492047 / 175.220235 |
| 1500/200/.06 beats 1550/100/.06 | 1596.456829 / 175.903237 / 0.060000 | 1596.456829 / 175.903237 / 0.060000 | 1596.255148 / 175.719243 |
| 1200/80/.05 beats 1900/60/.07 | 1235.795455 / 80.317544 / 0.050007 | 1235.795455 / 80.317544 / 0.050007 | 1235.379854 / 79.849921 |
| 2100/60/.06 loses to 2000/120/.06 | 2087.711310 / 60.151990 / 0.060002 | 2087.711310 / 60.151990 / 0.060002 | 2088.062791 / 59.285515 |

Handicap grid: `diff` of the 90 `P2` lines (size, rules, komi, stones → rank difference and black's
adjustment at 1500) from Python and Scala printed nothing (`P2 IDENTICAL (90 rows)`). Sample rows:

```text
P2 19 japanese 0.5 5 4.458333 318.568588
P2 19 chinese 7.5 0 -0.041667 -2.697356
P2 13 japanese 0.5 2 4.375000 312.034033
P2 9 chinese 6.5 1 -0.250000 -16.111552
```

A rated handicap game, 4.5k (black, rank 25.5) beats 0.5d (white, rank 30.5), 19×19, Japanese,
4 stones, komi 0.5, both deviation 80:

```text
P3 goratings        black 1579.573482 -> 1602.038166 white 1960.378534 -> 1937.119169
P3 ogs-configured   black 1579.573482 -> 1602.038166 (5k -> 5k), white 1960.378534 -> 1937.119169 (1d -> 1d)
P3 lila-configured  black 1579.573482 -> 1601.679482 (5k -> 5k), white 1960.378534 -> 1937.491039 (1d -> 1d)
P3 no-adjustment    black 1579.573482 -> 1611.397932
```

Rank labels (rating → OGS rank → label, deviation 60; deviation 200 shows "?"):

```text
525 → 0.00 → 30k    1000 → 14.92 → 16k   1500 → 24.30 → 6k   1800 → 28.52 → 2k
1950 → 30.38 → 1d   2100 → 32.09 → 3d    2400 → 35.18 → 6d   2800 → 38.75 → 9d
```
