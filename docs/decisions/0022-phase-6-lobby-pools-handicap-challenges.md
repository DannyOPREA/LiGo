# 0022. Phase 6: the lobby's pools, auto-handicap, open challenges, player test and load test
- Status: Accepted
- Date: 2026-09-29
- Decided by: Claude, under the owner's 2026-09-28 delegation ("Don't ask for my approval for
  anything, just work until I tell you to stop")

## Context
Phase 6 (docs/PLAN.md §4 and §5, units 6.1–6.10) turns lila's lobby into LiGo's showcase: a
quick-pair grid with the presets of [ADR 0005](0005-initial-lobby-presets.md), one chip row
(`Rated / Casual` · `Handicap OK / Even only`), pools with auto-handicap, a readable open-challenges
table, one custom-game modal, waiting feedback, a direct challenge from any profile, and a player
test against OGS. [ADR 0021](0021-phase-5-ratings-signup-display-handicap.md) §4 already fixes how
many stones a rank gap gives (`GoRating.suggestedStones`, unit 5.2) and left pools, and whether
guests meet signed-in players, to this phase.

What lila does today (checked in the code, 2026-09-29):
- **Pools** (`modules/pool`) are real-time only, keyed by clock (`PoolList`: 1+0 … 30+20), and
  **always rated** (`GameStarter` sets `Rated.Yes`). A pool pairs its members in "waves": a
  scheduled wave every 12–60 s (`PoolList`, `PoolActor`), or a "full wave" as soon as 20–40 players
  wait. Each wave runs a weighted matching (`MatchMaking.wmMatching`): a pair's score is the rating
  gap minus bonuses (the **smaller** of the two players' miss bonuses, 12 points per missed wave up
  to 400, less for players who often leave losing games; +200 when both have compatible range settings; +30 when both have good sit counters, a
  penalty when they differ; +30 when both are provisional), and a pair is forbidden when the score
  passes a cap taken at the lower rating (100–130 below 1500, rating / 15 above), or when either
  player's range setting excludes the other.
- A **guest's click on a pool tile** becomes a casual hook with that clock (`xhr.anonPoolSeek`).
- A casual hook joins a compatible waiting hook at once (`LobbySyncActor`, `findCompatible`). A
  **rated** hook that "seems pool-compatible" (`Hook.seemsCompatibleWithPools`: rated, standard
  variant, random colour, and a pool's clock) is not matched at once: the pool pulls it in at its
  next wave (`HookThieve`, `HookRepo.poolCandidates`). The test looks only at the clock.
- **Hooks** (real-time open games) and **seeks** (correspondence) are shown in two tabs, filtered in
  the browser by a settings form (`ui/lobby/src/filter.ts`), with a rating-vs-time chart as another
  view. But the **server already hides every open game you can't join**: a hook reaches a viewer
  only if `Biter.canJoin` passes (`LobbySocket`, `showHookTo`: same kind of player, both "lame" or
  neither, no block either way, not your own, your rating inside its range), and a player's seek
  list is filtered the same way (`SeekApi.forUser`). The hook JSON has no rating range.
- A seek joins the **newest** compatible seek at once, or waits (`LobbySyncActor`, `AddSeek` →
  `findCompatible`; compatible = same variant, rated and days per move, ranges both ways). Seeks
  need an account.
- A pool tile shows the clock and, while you wait, a spinner or your range setting. There are no
  per-tile counts; the home page shows site-wide player and game counts.
- The create-game modal (`ui/lobby/src/view/setup`) and the challenge form share `setupCtrl`; a
  profile has a "challenge to a game" button that opens it for that player.
- A signed-in player's hook without a range setting gets a default range from lila's chess rating
  distribution (`RatingRange.defaultFor`, `Hook.ratingRangeOrDefault`).

## Decision

### 1. The pool list
- **Seven real-time pools**, exactly ADR 0005's real-time tiles, one pool per board size and time
  control. A pool's clock is the clock interface of unit 4.7 (Fischer or byo-yomi,
  [ADR 0020](0020-scoring-phase-protocol-and-byoyomi-shape.md) §7).
- **Pool ids** name the size and clock in characters that need no escaping in URLs and JSON:

  | Tile | Pool id |
  |---|---|
  | 9×9, 1 min + 5×10 s | `9x9-1m-5x10s` |
  | 9×9, 3 min + 3×20 s | `9x9-3m-3x20s` |
  | 9×9, 3+2 Fischer | `9x9-3m-2s` |
  | 19×19, 5 min + 5×10 s | `19x19-5m-5x10s` |
  | 19×19, 10 min + 5×30 s | `19x19-10m-5x30s` |
  | 19×19, 20 min + 5×30 s | `19x19-20m-5x30s` |
  | 19×19, 10+10 Fischer | `19x19-10m-10s` |

  The ids live in lila (`PoolConfig`, `LobbySocket`'s `poolIn`/`poolOut`, the lobby page data);
  lila-ws passes those messages through without reading them.
- **Every pool plays Japanese rules** with the spec's komi (6.5 even, 0.5 with handicap; R-KOMI-1/2).
  The ruleset is not a pool dimension: it would split small pools in two for a choice most players
  don't make per game. Chinese rules stay available through the custom game.
- **Waves every 5 seconds** in every pool, instead of lila's 12–60 s, so a click on a tile with a
  suitable partner already waiting starts a game well inside PLAN §4's 10 seconds (at most about
  6 s to the wave, lila adding up to a second of random delay, then the game starts). lila's
  full-wave thresholds (20–40 players) stay; at the POC's
  size they are never reached. Longer waves only pay off with many players to choose from, so
  revisit this if a pool regularly holds more than about ten.
- **The miss bonus keeps lila's rate per second**, not per wave: 5 points per missed 5 s wave (lila:
  12 per 12 s wave), with lila's ceiling (400 points for a player with a good sit counter).
  Unchanged at 12 per wave, the 5 s waves would widen who you can meet 2.4 times faster than lila's
  fastest pool and reach the ceiling in under 3 minutes.
- **The two correspondence tiles** (1 day and 3 days per move) are **not pools**: a click sends a
  seek (19×19, Japanese, even, the Rated/Casual chip), and lila's own seek matching joins the newest
  compatible seek at once or leaves it waiting, shown on the tile with a Cancel button. Seek
  compatibility gains board size, ruleset, komi and handicap (unit 6.5, in `Seek`'s compatibility
  properties). Correspondence tiles are **even only** in Phase 6 (rated seeks stay even, ADR 0021 §4;
  a correspondence handicap game goes through a direct challenge), and need an account as in lila:
  a guest's click shows "Correspondence games need an account", linking to signup.

### 2. The chip row
- The chips are remembered per player: a new lila preference for a signed-in player (unit 6.6 adds
  it to `pref`) and local storage for a guest. They apply to every tile click.
- **Rated / Casual.** Rated clicks join the pool (pools stay rated only, as in lila). **Casual clicks
  send a casual hook with the tile's settings and no rating range**, exactly what lila already does
  for a guest's click, which joins a compatible casual hook at once if one is waiting. This reuses
  lila's two paths instead of doubling every pool. Casual quick-pair games are **even** (a guest has
  no rating to handicap from; a signed-in player who wants a casual handicap game has the custom
  game). Guests only ever see Casual (ADR 0021 §5); the Rated chip is replaced by the "Sign up to
  play rated games" line. Cancelling a casual click cancels the hook (lila's `hookOut`), not a pool.
- **Handicap OK / Even only** is a **member flag**, not a pool of its own: a pair gets handicap
  stones only when **both** members said Handicap OK; otherwise the game is even and the pair is
  judged by lila's even-game score. With Casual chosen, the chip is shown disabled with a hint
  ("casual quick games are even"). The flag travels in the lobby socket's `poolIn` message (a new
  field; `LobbySocket` reads it into the pool member).
- The rating-range setting stays (lila's per-member range, shown as ranks with 5.2's rank table,
  ADR 0021 §3). It is a hard limit, applied to the players' ratings before handicap is considered.

### 3. Auto-handicap at pairing
For a pair where both members said Handicap OK and both have a rank (an account still at 1500 /
500, never declared and never rated, gets stones 0 against anyone, ADR 0021 §4; the pool member
gains a field for this, since `PoolMember` carries no deviation today):
- **Stones** `n = GoRating.suggestedStones(ratingA, ratingB, size)` (ADR 0021 §4: one stone per rank
  on 19×19, six ranks per stone on 9×9, halves up, capped at 9 and 4). 0 is an even game, 1 the
  no-komi game (R-HCP-2).
- **Colours**: with `n > 0` the lower-rated player takes Black; with 0, lila's random colours.
- **Komi**: the spec's (0.5 with any handicap), Japanese rules as every pool; the game is rated with
  the handicap maths as unit 5.3 does it.
- **The pairing score** is lila's, with its "rating gap" term replaced for a handicap pair by:

  `gap = (ratingOf(rankOf(low) + left) − low) + 15 × n`, where
  `left = |rankOf(high) − rankOf(low) − n × stoneValue|`, `stoneValue` is 1 on 19×19 and 6 on 9×9,
  and `low`/`high` are the two ratings.

  That is: the rank gap the stones don't cover (on the same one-rank-per-stone basis as
  `suggestedStones`; the rating update, not the pairing, uses goratings' finer value of a stone),
  turned into rating points upwards from the weaker player, plus 15 points per stone. Every other
  term (bonuses, the cap, range conflicts, blocks) is lila's, unchanged, except the miss bonus's
  rate (§1). For an even pair the term
  stays lila's `|ratingA − ratingB|`.
- **How this meets lila's cap** (100–130 points for ratings below 1500, rating / 15 above): the
  stones cover the gap to within half a rank, so a 19×19 handicap pair costs 15 points per stone
  plus up to half a rank (about 30 points at 1500). Two players with good sit counters (+30) can be
  paired with about 6–8 stones in their first wave, depending on how closely the stones fit the
  gap (8 × 15 = 120 ≤ 100 + 30 at the lowest cap when they fit exactly); more follow after a missed
  wave or two. Handicap is
  meant to be available at once: a 5-stone game between a 5k and a 1d is a fair game, and nobody
  should wait for it. The per-stone cost only tips the balance **towards an even game when one is on
  offer at a similar remaining gap**; lila's matching pairs the whole pool at once, so this is a
  preference, not a guarantee. On 9×9 the uncovered part can be up to 3 ranks (one stone covers 3–9
  ranks of gap), about 200 points, which the cap forbids until the players have waited several
  waves; 9×9 handicap is coarse by nature. The 9×9 cap of 4 stones covers gaps up to 27 ranks, so a
  20k and a 5d can meet on 9×9 with 4 stones: ADR 0021 §4 accepted 4 stones as the most a rated 9×9
  game gets, and the rating update prices it.
- Above the stone cap the uncovered part counts like any rating gap, so lila's cap still forbids a
  20k meeting a 5d on 19×19 (9 stones, 15 ranks uncovered).
- Unit 6.2 builds this score (with the waiting range below and the per-second miss bonus) as new
  code beside `MatchMaking`, reusing its other bonus functions; 6.4 makes `MatchMaking` call it.
  The 15-point value may be retuned by 6.2's
  tests if one of the cases above comes out differently; the rule stays.

### 4. Waiting on a tile
- **Counts**: each pool reports how many members are waiting after every wave and on each join or
  leave (throttled to once every 2 s), in a new lobby socket message to lobby viewers. A tile shows
  the count for the viewer's Rated/Casual chip: rated, the pool's members; casual, the open casual
  hooks with the tile's settings that the viewer could join (the browser already has them; after
  §5 it also gets hooks of the other kind of player, which don't count). There is no per-tile count
  of games in play (lila has none; the home page keeps its site-wide counts), so PLAN's 6.6 row says
  "how many are waiting".
- **The widening range**: after each wave the pool tells each waiting member the ranks it can
  currently meet, computed with the real pairing score (§3) against a **typical opponent** at the
  middle of each rank from 25k to 9d: one who has waited as long as the member (so the miss bonus is
  the member's own), has a good sit counter (0), is not provisional and has no range setting. Ranks
  outside the member's own range setting are left out. The tile shows the weakest and strongest such
  rank ("3k–1d") and, with Handicap OK, the most stones among them ("or up to 7 stones"). It is an
  approximation of who the matching would accept, stated as such in the hover title: a player who
  has just joined brings a smaller miss bonus, a provisional or range-setting player a larger one.
  The stone count doesn't grow much with waiting, because handicap is available from the first wave
  (§3); the rank range is what widens.
- **Elapsed time** is counted in the browser from the click; **Cancel** is a click on the same tile
  or a Cancel button on it (lila's `poolOut`, or `hookOut` for a casual click).
- A guest's casual hook shows the same tile state minus the range (guests have no rank).

### 5. Open challenges
- lila's "Lobby" (real-time hooks) and "Correspondence" (seeks) tabs become **one "Open challenges"
  table** with a Live / Correspondence chip. Columns: player + rank · board · time · rules ·
  even/handicap · rated. On phones each row becomes a card.
- **What the server still hides**: open games from or to players you block or who block you, games
  of the other "lame" kind (lila's flag for troll and banned accounts), and nothing else. It stops
  hiding games you can't join for being the other kind of player (guest or signed-in), for your
  rating being outside their range, or for being rated when you are a guest: those are sent, with
  the game's rating range and whether its creator is signed in added to the hook and seek JSON
  (unit 6.5 changes `showHookTo`, `SeekApi.forUser` and the payloads; a guest's seek list,
  `forAnon`, already has every seek). The join itself is still checked on the server by
  `Biter.canJoin`.
- **The browser decides** what suits you, as lila's `filter.ts` already filters there: it knows the
  viewer's rating, chips and the rank table. A row **you can't join is greyed** and listed last, with
  a one-word reason in its hover title ("rated", "range", "members", "guests"). A row **suits you**
  when you can join it and it matches your chip row (rated or casual; even or handicap); those come
  first, sorted by rank closeness. Rows you could join that don't match your chips sit in between,
  not greyed.
- Rated open challenges stay **even only** (ADR 0021 §4). A hook's handicap and colour settings
  count for pool compatibility (§6).
- **Filter chips** (board size, live speed, rated, even/handicap) replace lila's filter form. The
  rating-vs-time chart view goes.

### 6. Which hooks the pools take
A rated hook is pulled into a pool (lila's `HookThieve`) only when it would have been a pool game
anyway: rated, random colour, even (no handicap set), the pool's **board size and clock**, Japanese
rules and the spec's komi. Every other rated hook is matched like a casual one, at once, with a
compatible hook. A pulled-in hook counts as **Even only** (its creator chose even in the form).
Unit 6.4 changes `Hook.seemsCompatibleWithPools`, `compatibleWithPool`, `PoolList`'s clock
compatibility check and `HookRepo.poolCandidates` accordingly.

### 7. What else in lila's lobby stays, changes or goes
- **Stays**: the "now playing" tab and its carousel of your ongoing games, the site-wide counters,
  the create-game modal (made into 6.8's single modal), the profile challenge button (6.8).
- **Changes**: the tabs become Quick pairing · Open challenges · Now playing.
- **Goes** (if Phase 3 hasn't already removed them): the chart view and the filter form; the
  play-with-computer button (bots removed in 3.5); the chess default rating range for hooks
  (`RatingRange.defaultFor`): a hook without a range setting accepts any rank.

### 8. Guests and signed-in players
Kept apart, as lila does and ADR 0021 §5 kept for Phase 5: a guest's hook matches only guests. The
player test (6.10) asks whether this confuses anyone; changing it is a new ADR.

### 9. The player test (unit 6.3's kit, run after 6.10)
- **Think-aloud**, remote screen share or in person, **at least 3 Western Go players** who have used
  OGS at least once, recruited by the owner.
- The **same four tasks on OGS and on LiGo**: start a game at your level with one click; find an
  open game that suits you and join it; create a custom game with settings you're given; challenge a
  named player. Half the participants start with OGS, half with LiGo.
- Per task: time to complete, errors and dead ends, a 1–7 ease rating (the Single Ease Question);
  at the end, which lobby they'd rather use and why. Notes only; a recording only with the
  participant's OK, deleted after the notes are written.
- Results go to `docs/research/lobby-test/`, participants named P1, P2, P3; each finding becomes a
  unit (preset changes supersede ADR 0005).
- LiGo runs on the owner's machine; participants use it through the owner's screen or from another
  device on the same network (docs/demos/phase-2.md §4 explains how a second device reaches it).

### 10. The load-testing tool
**k6** (Grafana, AGPL-3.0): one static binary, scenarios written in JavaScript, HTTP and websocket
support in the core, thresholds that fail a run. It is **a tool the developer runs**, not part of
LiGo: `dev/ligo loadtest` downloads a checksum-pinned release into `.ligo/` the way
`dev/ligo katago install` does, so no npm, sbt or repo dependency changes. Unit 6.9 writes the
scenario (pairs join a pool and play short games to the end over lila's API and websockets) and
records numbers from a small cloud run; it doesn't run in CI.

## Consequences
- 6.2 has its exact scope: §3's score (reusing `MatchMaking`'s bonus functions), stones, colours and
  the waiting range of §4, as pure functions with tests.
- 6.4 changes `PoolList` (the seven pools, 5 s waves, the per-second miss bonus), `PoolConfig`,
  `PoolMember` (the Handicap OK
  flag and whether the rank is known), `MatchMaking`, `GameStarter`, `LobbySocket`'s `poolIn`, and the
  pool-compatibility checks in `Hook`, `HookRepo` and `HookThieve` (§6).
- 6.5 adds size, ruleset, komi and handicap to hook and seek compatibility and JSON, adds the rating
  range and the creator's kind to the payloads, narrows the server-side hiding to blocks and "lame"
  (§5), and drops the chess default range.
- 6.6 adds the chip preference, the per-tile counts message and the waiting range to `ui/lobby`'s
  pool view; 6.7 replaces the tabs, the filter form and the chart.
- Casual quick-pair games are always even, and correspondence tiles too; the custom game and the
  direct challenge are the way to other handicap games.
- A pool shows a waiting count, which with few players is often 0 or 1; that is honest, and the
  player test will say whether it discourages people.
- More open games reach each browser than in lila (the ones you can't join, greyed). At the POC's
  size this is a few rows.

## Alternatives considered
- **Pools split by chip** (rated/casual × handicap/even, four pools per tile): simplest to pair, but
  divides a small player base by four; flags and compatibility rules keep one pool per tile.
- **Casual pools** instead of casual hooks: a second pool path for something lila already handles.
- **A ruleset per pool** or a Japanese/Chinese chip: doubles the pools for a choice the custom game
  covers.
- **lila's 12–60 s waves**: they break PLAN §4's 10-second goal whenever a partner is already
  waiting. **A wave on every join**: pairs greedily as soon as two people are in, which is right for
  a tiny site but degrades the matching as soon as there are more; 5 s waves sit between.
- **Correspondence pools with waves**, or a new join-or-create path: lila's seek matching already
  joins a waiting compatible seek; it only needs Go's properties.
- **Handicap on correspondence tiles**: needs the stone count fixed when a seek is created, before
  the opponent is known; the direct challenge already does it with a named opponent.
- **"Suits you" computed on the server per viewer**: a per-viewer field on every hook broadcast,
  when the browser has everything it needs once the server stops hiding the joinable-but-greyed
  rows.
- **Hiding incompatible open challenges** (lila's behaviour): PLAN §4 asks for them greyed, so
  players see there is activity.
- **Goratings' value of a stone in the pairing score** (about n − 0.54 ranks for n stones): would
  make the score disagree with the stone count it is judging; the rating update already uses it.
- **Artillery** (MPL-2.0, Node): would be an npm dependency in lila's workspace; **Gatling** (Scala):
  heavier to set up for a one-person project; **Locust** (Python): websocket support is a plugin.
  k6 needs nothing added to the repo.
