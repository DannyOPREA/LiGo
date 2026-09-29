# 0021. Phase 5: one rating pool, self-declared starting rank, rank display, rated handicap, guests
- Status: Accepted
- Date: 2026-09-29
- Decided by: Claude, under the owner's 2026-09-28 delegation ("Don't ask for my approval for
  anything, just work until I tell you to stop")

## Context
Phase 5 (docs/PLAN.md §5, units 5.1–5.8) gives LiGo accounts with Go ranks and rated games. The maths
is settled: lila's Glicko-2 with OGS's settings, OGS's rank curve and goratings' handicap values
([ADR 0013](0013-lila-glicko2-with-ogs-settings.md), [ADR 0004](0004-ogs-rank-curve.md), the
[ratings memo](../build-vs-buy/ratings.md)); unit 3.11 adds a single `go` perf
([ADR 0019](0019-go-core-types-schema-protocol.md) §3). Komi and handicap placement are in the rules
spec (R-HCP-1–5, R-KOMI-1–4). Left open, and decided here: how the one pool replaces lila's
per-speed ratings, what a new player's starting rating is, how ranks are shown, which games may be
rated with handicap and how many stones a rank gap gives, and what guests can do.

Numbers below use the curve `rank = ln(rating / 525) × 23.15`, where rank 30 is 1d; a kyu label is
`ceil(30 − rank)`k and a dan label `floor(rank − 29)`d (ADR 0013).

## Decision

### 1. One pool: the `go` perf is the only rated perf
- Every rated Go game, on every board size and at every speed including correspondence, updates the
  player's one `go` perf (PLAN §1.2). No per-speed or per-size Go ratings exist.
- `RatingRegulator` applies no factor to it (its factors are for chess speeds). Glicko-2 inactivity
  aging (0.21436 periods/day) stays.
- One Go leaderboard, one line on the rating graph, one perf stats page. lila's chess perfs stop
  being shown once unit 3.17 removes chess games; their stored values are left alone (no migration:
  LiGo has no production data).
- The puzzle perf stays separate (Phase 8).

### 2. Self-declared starting rank
- The signup form asks "Your Go rank" with a list from **25k to 9d**, plus **"I'm new to Go"**
  (25k) and **"I don't know"**. The default selection is "I don't know".
- A chosen rank starts the `go` perf at the **middle of that rank** on the curve (rank value
  30.5 − k for k kyu, 29.5 + d for d dan), so the chosen label is what's shown: 25k 666, 15k 1026,
  10k 1273, 5k 1580, 1k 1877, 1d 1960, 5d 2330, 9d 2770. Deviation **250** (OGS's value for a
  player with a rank hint), volatility 0.06 (ADR 0013).
- "I don't know" (and every account that never answered, including existing ones) keeps lila's
  default, 1500 with deviation 500, i.e. 6k with "?".
- A player may change the self-declared rank on their account page **until their first rated game
  ends**; after that the rating only moves by playing.
- Why a full list rather than OGS's four hints: PLAN §3.7 asks for the rank through the inverse
  curve, and Western players know their rank from clubs or OGS. The high deviation means a wrong
  guess corrects itself within a few games.

### 3. Rank display
- Everywhere a rating would show (player names in the round and game lists, user links and
  mini-profiles, the leaderboard, lobby lists), LiGo shows the **rank label** instead of the number.
- Labels are clamped to **25k–9d** (OGS's display bounds): a rating below 25k's floor shows "25k",
  above 9d shows "9d".
- While the rating is provisional (deviation ≥ 110, lila's and scalachess's threshold, kept by
  ADR 0013) the label carries a question mark: **"5k?"**. The mark alone would hide the one thing a
  new player told us.
- The rating number (and deviation) still shows on the profile, the perf stats page and in the
  label's hover title, and the JSON API returns `rating`, `provisional` and a new `rank` string.
- **Labels are made on the server** by 5.2's `GoRank` and sent to the browser; the browser does not
  port the formula. The rating graph's axis gets its kyu/dan ticks as a list of `(rating, label)`
  pairs from the server. 5.2 still writes a JSON table of rank cases, so a browser-side label can be
  checked against it if one is ever needed.
- The scalachess provisional threshold (110) is not changed, so ADR 0019's revisit clause for it is
  not triggered.

### 4. Rated handicap games
- A rated game may have a handicap of 0–9 stones on **19×19** and 0–4 on **9×9**. 13×13 rated games
  are even only until the spec has a 13×13 handicap table (the playground has the same limit).
- Rated games use the spec's komi only (R-KOMI-1/2: 6.5 Japanese / 7.5 Chinese even, 0.5 with any
  handicap). A game with any other komi can only be casual, so every rated result is one the
  handicap maths was calibrated for.
- The rating update uses goratings' handicap maths with the game's size, ruleset, komi and handicap
  (ADR 0013); the stored `hc` of 1 means "no stone, Black first, komi 0.5" (R-HCP-2), which the maths
  also treats as "no komi".
- **Suggested stones for a rank gap.** With `gap` the difference between the two players' rank
  values (from their current ratings, not the rounded labels) and a stone worth 1 rank on 19×19 and
  6 on 9×9 (ADR 0013): `stones = round(gap / stoneValue)` (halves round up), capped at 9 on 19×19
  and 4 on 9×9. A result of 0 is an even game, 1 is the no-komi game. The weaker player takes Black.
  Example: 5k (25.5) vs 1d (30.5) on 19×19 → 5 stones; on 9×9 → round(0.83) = 1 (no komi).
- The challenge form (5.7) offers this count as the default and lets the challenger change it within
  the limits above; Phase 6's pools use the same function for auto-handicap.
- Provisional players get the same rule; their high deviation already limits what one game means.

### 5. Guests
- Guests (not signed in) can create and join **casual** games only, as lila already enforces. The
  setup and challenge forms don't show the rated option to guests; in its place is one line, "Sign up
  to play rated games", linking to signup. The server refuses a rated seek or challenge from a guest
  whatever the form sends.
- Guests show no rank.

## Consequences
- 5.2 gets its exact scope: the curve and inverse, clamped labels with "?", the midpoint starting
  ratings, the handicap maths and the stone-count function, each tested with the memo's numbers and
  this ADR's examples.
- 5.4's signup and account page, 5.5's display and 5.7's forms follow sections 2, 3 and 4–5.
- A player's first few rated games move their rating a lot (deviation 250), as on OGS.
- Anyone can claim 9d at signup; for a local proof of concept this is accepted, and the "?" shows
  until the claim is tested by games.

## Alternatives considered
- **OGS's four starting hints** (new ≈ 23k, basic ≈ 17k, intermediate 1500, advanced ≈ 1k):
  simpler, but a 3d club player would start at 1k and lose a lot of games to get there.
- **Starting at the bottom of the chosen rank** instead of its middle: one loss would drop the label
  a rank straight away.
- **"?" alone while provisional** (OGS): hides the self-declared rank we just asked for.
- **Labels computed in the browser** too: a second copy of the formula to keep in step, for no page
  that needs it; the server already sends ratings with every player.
- **Custom komi allowed in rated games**: goratings' maths accepts any komi, but OGS's calibration
  is for standard komi, and it gives players a way to game the adjustment.
- **Rated 13×13 handicap now**: no handicap placement table exists for 13×13 yet.
