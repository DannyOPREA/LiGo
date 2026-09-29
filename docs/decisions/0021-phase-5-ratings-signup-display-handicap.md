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
  (25k) and **"I don't know"**. The default selection is "I don't know". lila's simple-signup path
  (the prefilled form) gets the same field with the same default.
- A chosen rank starts the `go` perf at the **middle of that rank** on the curve (rank value
  30.5 − k for k kyu, 29.5 + d for d dan), so the label a new player sees is the one they chose:
  25k 666, 15k 1026, 10k 1273, 5k 1580, 1k 1877, 1d 1960, 5d 2330, 9d 2770. Deviation **250**
  (OGS's value for a player with a rank hint), volatility 0.06 (ADR 0013). A rank band is only about
  ±35 points wide at 5k, so the first result usually moves the label a rank or two either way; that
  is the high deviation doing its job, not something the starting point can prevent.
- "I don't know" (and every account that never answered, including existing ones) keeps lila's
  default, 1500 with deviation 500 (6k with "?"). One value for "unknown" everywhere keeps lila's
  `Perf.default` untouched; OGS's 350 would be a second default for new signups only.
- A player may change the self-declared rank on their account page **until their first rated game
  starts**; from then on the rating only moves by playing. (PLAN 5.4 said "once"; this replaces it.)
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
  label's hover title. The JSON a page or the API gets keeps lila's fields (`rating`, and `prov` or
  `provisional` as each payload names it today) and gains a `rank` string beside them.
- **Labels are made on the server** by 5.2's `GoRank`; the browser gets the finished label.
- **Rank ranges in the browser** (5.7's rating ranges shown as rank ranges, Phase 6's widening
  range): the server sends a **rank table**, the rating at the lower edge of each rank from 25k to
  9d, in the page data. The browser's sliders move in whole ranks and turn them into rating bounds
  with that table, so `ratingRange` stays in rating points on the wire and in lila's lobby filter,
  and no copy of the curve formula lives in TypeScript. The rating graph's kyu/dan axis uses the same
  table. 5.2 also writes a JSON table of rank cases, so a browser-side label can be checked against it
  if one is ever needed.
- The Go leaderboard lists players whose deviation is at most **75** (lila's `rankable` value for
  standard chess). lila's `pairingDefault` (1450 for a first pairing) stays for the lobby.
- The scalachess provisional threshold (110) is not changed, so ADR 0019's revisit clause for it is
  not triggered.

### 4. Rated handicap games
- Server games are 9×9 and 19×19 only (R-SCOPE-1); 13×13 needs its own ADR, with a placement table
  and a cap, when it comes.
- A rated game may have a handicap of 0–9 stones on **19×19** and 0–4 on **9×9**. Four 9×9 stones
  are already worth about 21 ranks by goratings' maths; beyond that a 9×9 game says little about
  either player's strength.
- Rated games use the spec's komi only (R-KOMI-1/2: 6.5 Japanese / 7.5 Chinese even, 0.5 with any
  handicap). A game with any other komi can only be casual, so every rated result is one the
  handicap maths was calibrated for.
- **The rating update** uses goratings' handicap maths with the game's size, ruleset, komi and
  handicap (ADR 0013), with **no colour advantage** (lila's chess `ColorAdvantage` calculators are
  not used for Go). LiGo's 1-stone game ("no stone, Black first, komi 0.5, no compensation",
  R-HCP-2) is passed to the maths as **handicap 0 with komi 0.5**, which is exactly what it is under
  both rulesets; goratings' own 1-stone case would add a Chinese compensation point that R-KOMI-3
  doesn't give. From 2 stones the game's stone count is passed as it is (goratings' N points of
  Chinese compensation match R-KOMI-3).
- **Suggested stones for a rank gap.** With `gap` the difference between the two players' rank
  values (from their current ratings, not the rounded labels) and a stone worth 1 rank on 19×19 and
  6 on 9×9 (ADR 0013): `stones = round(gap / stoneValue)` (halves round up), capped at 9 on 19×19
  and 4 on 9×9. A result of 0 is an even game, 1 is the no-komi game. This is the familiar "one stone
  per rank" (PLAN §3.7, OGS's frontend), chosen knowingly: goratings values n stones with komi 0.5
  at about n − 0.5 ranks on 19×19, so the suggestion slightly favours the stronger player, and the
  rating update corrects for exactly that. Because the gap uses unrounded ratings, two players whose
  labels differ by one rank can get an even game.
- An account that has never declared a rank and never finished a rated game (still at 1500 / 500)
  is suggested an even game against anyone: its 6k is a placeholder, not a strength.
- **Where handicap can be rated in Phase 5:** only in a **direct challenge to a named player**. The
  challenge form (5.7) shows the suggested stones from both players' ratings at creation; the
  challenger may change them by at most one stone either way within the limits above (any count in
  casual games). With stones > 0 the colour choice is locked: the lower-rated player at creation takes
  Black, the challenged player on an exact tie. The stones and colours are fixed when the challenge
  is sent; later rating changes don't alter them.
- Rated lobby seeks and open challenges (no named opponent) are **even only** in Phase 5. Phase 6's
  pools add auto-handicap at pairing time, with the same stone function.

### 5. Guests
- Guests (not signed in) can create, join and accept **casual** games only. lila hides the rated
  option from guests in its setup forms, but a guest can accept a rated open challenge today (the
  accept path copies `rated` without checking who accepts), so 5.7 adds the check: the server refuses
  a rated seek, challenge, lobby join or challenge acceptance by a guest whatever the request says.
  In place of the rated option guests see one line, "Sign up to play rated games", linking to signup.
- lila's lobby never pairs a guest with a signed-in player (seeks match only the same kind); LiGo
  keeps that in Phase 5, and Phase 6's player test decides whether it stays.
- Guests show no rank.

### 6. Other lila behaviour the Phase 5 units adapt
- lila's farm-boost check (`FarmBoostDetection`) skips the rating update for some games between new
  accounts that know each other, with chess-tuned move and time thresholds. It stays; 5.3 retunes its
  thresholds for Go (a Go game has many more plies), and 5.8's demo game is long enough not to trip it.
- `PerfsUpdater`'s chess-only paths (per-variant calculators, `updateStandard`) go in 5.3.
- New English strings (the rank question and its options, the guest line, kyu/dan labels) go
  through lila's i18n keys, so other languages stay possible.

## Consequences
- 5.2 gets its exact scope: the curve and inverse, clamped labels with "?", the midpoint starting
  ratings, the handicap maths and the stone-count function, each tested with the memo's numbers and
  this ADR's examples.
- 5.2 also produces the rank table (section 3), and passes 1-stone games as handicap 0 (section 4).
- 5.3 follows sections 4 and 6; 5.4's signup and account page, 5.5's display and 5.7's forms follow
  sections 2, 3 and 4–5.
- A player's first few rated games move their rating a lot (deviation 250), as on OGS.
- Anyone can claim 9d at signup; for a local proof of concept this is accepted, and the "?" shows
  until the claim is tested by games.

## Alternatives considered
- **OGS's four starting hints** (new ≈ 23k, basic ≈ 17k, intermediate 1500, advanced ≈ 1k):
  simpler, but a 3d club player would start at 1k and lose a lot of games to get there.
- **Starting at the bottom of the chosen rank** instead of its middle: a new player would see a
  label that is only barely theirs, and any loss would put them below it.
- **"?" alone while provisional** (OGS): hides the self-declared rank we just asked for.
- **Labels and rank ranges computed in the browser** from a TypeScript copy of the curve: a second
  copy of the formula to keep in step, when a table from the server covers the only browser need.
- **Suggested stones that minimise the gap under goratings' maths**: closer to the rating maths
  (5k vs 1d would get 6 stones on 19×19), but surprising to Go players used to one stone per rank.
- **Custom komi allowed in rated games**: goratings' maths accepts any komi, but OGS's calibration
  is for standard komi, and it gives players a way to game the adjustment.
- **Rated handicap in seeks and open challenges now**: the opponent, and so the stone count and
  colours, is unknown until pairing; Phase 6's pools are where that belongs.
