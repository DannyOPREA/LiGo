# Ratings log

## Lessons (curated, ≤ 30 lines — read this first)
- OGS: Glicko-2, rank = ln(rating/525) × 23.15 (ADR 0004); handicap handled by shifting effective rank by a stone value that depends on board size and ruleset (2026-09-25, planning research).
- scalachess's Glicko-2 module is MIT and reusable (2026-09-25, planning research).
- scalachess `GlickoCalculator(tau = 0.5)` with `skipDeviationIncrease = false` reproduces goratings' `glicko2_update` to 6 decimals; lila itself runs tau 0.75 and skips step 6 (2026-09-27, unit 1.4).
- goratings' handicap/rank maths is in `analysis/util/RatingMath.py`, not its package; its `analysis/util/__init__` needs filelock etc., so load RatingMath.py and CLI.py directly (2026-09-27).
- Handicap per OGS: update each player against the opponent's effective rating (shift in rank space), i.e. two calculator calls per game; scalachess `ColorAdvantage` is symmetric and fixed, not a fit (2026-09-27).
- The "?" threshold (`provisionalDeviation = 110`) is a scalachess top-level val, not a lila constant; changing it means a fork or replacing call sites (2026-09-27).
- lila starts games at pairing and aborts them before 2 plies; `NoStart` (37) is a third "never played" status. "Has played a rated game" must exclude Aborted and NoStart (`Query.gotGoing`) (2026-10-03, unit 5.4).

- CI's ui Lint runs `oxlint --type-aware`; verify.sh's plain oxlint misses its type rules (e.g. no-unnecessary-type-assertion). Run `pnpm exec oxlint --type-aware ui/<pkg>` before pushing UI tests (2026-10-04, unit 5.7).
- lila treats a `HeadlessChrome` user agent as a crawler: challenge pages 404 and pages render the crawler view. Browser tests against the real site must send a normal Chrome user agent (2026-10-04, unit 5.8).
- A rated game between two accounts made today from one address moves no ratings unless it has 10+ moves and either 40+ moves or 90+ seconds (lila's FarmBoostDetection). Demos and manual checks must play long enough (2026-10-04, unit 5.8).
- lila allows 10 signups per address per 10 minutes and 5 game posts a minute; a whole e2e run nears both (2026-10-04, unit 5.8).
- A declared rank (deviation 250) is still lila's `clueless` (deviation cut-off below 250): test `GoRating.rankKnown`, never `clueless`, for "has a Go rank" (2026-10-04, unit 5.8).
## Entries (newest first)

### 2026-10-04 · unit 5.8 · The Phase 5 demo
- Did: `lila/tests/e2e-demo/phase5-demo.spec.ts` (desktop and phone, run by the `e2e` workflow and
  `dev/ligo e2e demo`): a 5k and a 1d sign up with those ranks, the 1d challenges the 5k to a rated
  19×19 Chinese game with the suggested 5 stones, they play 21 stones each, the 1d resigns, and both
  ratings must be goratings' own numbers for that game (1579→1695, 1960→1842, from
  `goRatingCases.json`), in the API and on the game page. A guest sees no Rated choice and plays a casual
  9×9 game. Demo checklist: docs/demos/phase-5.md.
- Fixed on the way: the setup windows offered Rated with an unlimited clock, which the server
  refuses ("Can't create rated unlimited game"); `ratedModeDisabled` now covers it. A declared rank
  was hidden until a first game in the user JSON, the profile header and side panel, the link preview
  title and the hover card: they tested lila's `clueless`, which a signup deviation of 250 still is;
  they now use `GoRating.rankKnown` (the hover card, in `modules/ui`, spells out the same rule). A 429
  reply to a game post made the setup window throw on non-JSON; it now shows lila's message.
- Worked: goratings' handicap case for a 5k vs 1d at deviation 250 is exactly what signup gives, so
  the expected numbers come from the same file the Scala tests check.
- Didn't work / dead ends: first runs got 404 on the challenge page (lila files HeadlessChrome under
  crawlers, and Round.watcher 404s challenge ids for crawlers); a 4-move game moved no ratings
  (FarmBoostDetection.newAccountBoosting: two new accounts from one address, under 10 moves, or under
  40 moves in under 90 s); repeated local runs hit the signup limit (10 per address per 10 minutes);
  a whole e2e run makes 6 game posts in a minute against lila's limit of 5, so `createGame` sets the
  game up again until lila takes it. The reviewer found no blocking issues; its six optional points
  (checklist steps, the unranked player's JSON, comments) were taken.
- Lessons: see the Lessons section (crawler user agent, anti-boosting minimum, signup limit).
- Decisions: logs/decisions.md 2026-10-04 (5.8).
- Verified by Claude: `dev/ligo e2e demo` on the running stack (Phase 3 and 5, desktop and phone:
  6 passed), lobby tests 95/95, GoRatingTest 24/24, GoLeaderboardJsonTest 5/5, lila compile, a scripted
  429 (the window says "Too many requests. Try again later.", no page error), verify.sh.
  · Needs owner verification: docs/demos/phase-5.md.
- Follow-ups: none in Phase 5; this closes it.

### 2026-10-04 · unit 5.5 (part 2) · The one Go leaderboard
- Did: `PerfType.leaderboardable` is just `go`, so rated Go games reach lila's ranking collection
  (players with 2+ games; "stable" = deviation at most 75, ADR 0021 §3) and /player shows one Go board
  (top 10, linking to the paged /player/top/go) beside "active players". Entries show the kyu/dan rank
  with the rating in the title; the leaderboard JSON gains `goRank` inside `perfs.go`. Chess perf
  leaderboard URLs are not found. The online list sorts on the Go rating; "Rating stats" and FAQ link to
  the Go rating distribution, which gains part 1's kyu/dan axis and ranks in its text.
- Worked: lila's ranking machinery (weekly ranks, perf trophies, distribution) needed no change beyond
  the leaderboardable list; a Plan agent mapped every consumer first.
- Didn't work / dead ends: none.
- Lessons: the reviewer noted that a link retarget makes a dormant lila page reachable (the rating
  distribution), so check what that page renders; and a hard-coded "no ?" on `LightPerf` is only safe
  while RankingApi (stable entries only) is its one producer, now pinned by a test (75 < 110).
  The online players list had been silently empty since 3.17 (it sorted on the chess standard perf).
- Decisions: one Go leaderboard replaces the chess ones; `goRank` beside `rating`; chess keys 404
  (logs/decisions.md).
- Verified by Claude: GoRatingTest 24/24, GoLeaderboardJsonTest 3/3, `node ui/test chart`, lila
  compile, `dev/ligo compile ui`, verify.sh. · Needs owner verification: /player, /player/top/go and
  the rating distribution page after two players pass deviation 75 (or a seeded deviation).
- Follow-ups: 5.8 (the Phase 5 demo).

### 2026-10-04 · unit 5.7 (part 2) · Rated games in the setup windows
- Did: the create-game windows follow part 1's server rules. Guests see a sign-up link instead of the
  casual/rated choice; a signed-in player sees why settings can't be rated (board, komi, stones without
  a named opponent, stones outside the allowed range). A rated challenge to a named player fetches
  `/setup/go-handicap/:username` (suggested stones per board, ±1, and who takes Black), shows the
  suggestion and "You play X", and moves out-of-range stones to the suggestion. The rating filter is in
  whole Go ranks (lobby page data carries GoRating's rank table). Pools follow 6.4 part 2 (rated
  pools), which merged while this PR was open: a rated game that fits a pool joins it.
- Worked: the server's eligibility check stays the source of truth; the form mirrors it, so a missed
  case still gets the server's refusal. 77 lobby tests (stubbed fetch for the suggestion).
- Didn't work / dead ends: `@/options` imports fail under the test resolver (use a relative path);
  the i18n test proxy must return functions for format keys.
- Lessons: the reviewer caught three real bugs: the lowest rank must be open downwards (a player under
  the 25k edge was outside their own range); a "reset to the suggestion" must never override what is
  always allowed (an even game) or fixed by a link; and a pool test with `pools: []` passed vacuously
  while the pool path had become dead code. Give a stub the data that makes the branch reachable.
- Decisions: casual stays the form's default (lila's is rated). Claude's calls under the 2026-09-28 delegation (logs/decisions.md).
- Verified by Claude: `node ui/test lobby` (77/77), `dev/ligo compile ui` (tsc), oxlint, verify.sh.
  · Needs owner verification: the windows on desktop and phone, a guest's sign-up link, a rated
  handicap challenge's colours vs "You play X", the rank filter.
- Follow-ups: 5.5 part 2 (the Go leaderboard).

### 2026-10-04 · unit 5.7 (part 1) · Rated Go games in the server
- Did: rated Go games are back. Signed-in players may create rated lobby games, correspondence
  seeks, direct challenges, open challenges and bulk pairings (form and API) when the setup is one
  ADR 0021 §4 rates: 9×9 or 19×19, the spec's komi, at most 9 or 4 stones (`GoSetups.ratedRefusal`,
  now shared with the rating update). A rated handicap needs a challenge to a named player with
  GoRating's suggestion ±1 stones (`GoRatedChallenge`); the server gives Black to the lower-rated
  player and won't send such a challenge to someone else later. Guests can't create, join or accept
  rated games (forms, `Hook.make`, `ChallengeApi.accept`, and `newGoGame` as the backstop, which also
  makes any uncovered setup casual). Rematches stay rated, and a handicap game's rematch keeps its
  colours on both of lila's rematch paths.
- Worked: one rule in `GoSetups` checked at three layers (form, game creation, rating update);
  `GoRating`'s existing stone function only needed a `Perf` version with ADR 0021's
  unknown-rank rule.
- Didn't work / dead ends: verify.sh's sbt test gate replayed cached results ("Total 0"); `testFull`
  runs the suites for real. Merging main after 3.17 part 2b needed nine conflict resolutions (variant
  and FEN fields gone from the same forms).
- Lessons: lila has two rematch paths (round's `Rematcher`, challenge's `ChallengeMaker`); a rule
  about colours must live in `rematchAlternatesColor`, which both ask. A rule computed against the
  opponent when a challenge is sent must be re-checked wherever the opponent can change
  (`toFriend`).
- Decisions: 5.7 split in two PRs (server, then forms); even rated challenges are always allowed;
  a guest's open challenge is casual; bulk pairings may be rated (even); "New opponent" after a
  handicap game resets komi; pools stay casual until 6.4 part 2 (Claude, under the owner's
  2026-09-28 delegation; ADR 0021 amendment, logs/decisions.md).
- Review (reviewer agent): blocking, both fixed: the in-game rematch of a handicap game swapped
  colours (now kept, tested); a rated handicap challenge could be re-targeted with `toFriend` (now
  refused, tested). Should-fix, done: rated even challenges written down in the ADR; guests' rated
  open challenges refused; COPYING.md entry for the new MIT file; tests for both fixes. Left for
  part 2: i18n keys for the new server messages, the stale UI comments, the HTML form's error.
- Verified by Claude: `testFull` for core 31, rating 23, setup 20, challenge 12, lobby 26, round 19,
  pool 30, and `GoRematchTest` 2/2, all passing; lila compile; chess guard; verify.sh. · Needs owner
  verification: on the real stack, a rated game between two accounts moves both ranks; a guest
  opening a rated challenge link sees "Sign up to play rated games"; Rematch after a rated handicap
  game keeps Black with the stones.
- Follow-ups: part 2 (the forms' rated option, guest line, rank ranges, suggested stones); 5.5 part
  2 (the Go leaderboard).

### 2026-10-04 · unit 5.6 · The profile in Go ranks
- Did: the profile shows the Go rank beside the name and, in the side panel, the one Go perf as its
  rank (games and progress beside it) above the puzzle line, instead of lila's chess perf lines. The
  rating history stores a `go` series (a Go game writes only that point now, not chess's standard
  and speed points) and the profile and perf-stats graphs plot only Go, with ticks on the rank edges
  labelled 25k–9d and the rating in the tooltip (`ui/chart/src/goRank.ts`, from the server's
  `GoRating.rankTableJson`). The Go perf-stats page shows ranks for the rating, highest and lowest,
  average opponent and best wins (numbers in hover titles). Activity says "5k → 4k" or "5k". The
  link preview says "Name (5k)" and "Current Go rank: 5k.". The graph's range slider handles got
  names (two site keys).
- Worked: lila's perf-stats indexer already handled Go games; chart.js's `afterDataLimits` and
  `afterBuildTicks` hooks gave a rank axis without a custom scale, and they rerun on every pan.
- Didn't work / dead ends: lila's phone CSS hides every span inside a side-panel rating, which hid
  the rank (now `rating > span`); the page test caught it only once it asserted visibility. The
  graph is canvas, so its picture is compared with a 3% pixel tolerance for the axis labels.
- Lessons: a page test that hides text in screenshots must also assert the key text is visible, or
  a CSS rule that hides it passes unnoticed.
- Decisions: chess perf lines leave the side panel now rather than at 3.17 (their data stays);
  puzzle ratings leave the graph (they would sit on a kyu/dan axis) but keep their side-panel line;
  Go games stop writing chess history points; activity drops the "?" (it keeps no deviation); a
  rank shows wherever one is known (deviation below lila's "clueless" 500), including a declared
  rank before any game (Claude, under the owner's 2026-09-28 delegation; logs/decisions.md).
- Review (reviewer agent): blocking: this log entry. Non-blocking fixed: ranks in the best-wins
  list, one rule for when a rank shows (header, title and description agreed on two), the chart
  test now uses the real rank edges, the history key choice is a pure tested function. Left for
  3.17: the now-unused `usernameWithBestRating`/`hasVariantRating` helpers.
- Verified by Claude: `rating/testOnly lila.rating.GoRatingTest` 19/19 (incl. the page test's
  rank-table copy), `history/testOnly lila.history.GoHistoryTest` 4/4, `node ui/test chart` 5/5,
  lila compile, the profile page test (desktop and phone, axe check) and the account page test,
  verify.sh. · Needs owner verification: the profile, the Go perf-stats page and the activity tab
  on the real stack after a rated Go game (from 5.7), dragging the graph through time.
- Follow-ups: 5.5 part 2 (the one Go leaderboard).

### 2026-10-03 · unit 5.5 (part 1) · Go ranks instead of rating numbers
- Did: wherever lila showed a rating, LiGo now shows the Go rank label ("5k", "5k?" while
  provisional) with the number in the hover title: user links, mini-profiles, game lists and
  player boxes, the round page, the lobby's open challenges and "your rating", challenge pages and
  lists. User links and best-perf spots show the Go perf, not lila's best chess perf. The JSON of
  games, rounds, hooks, seeks, challenges, the API game exports and user perfs gains a `goRank`
  string beside `rating` (made on the server by `GoRating.label`, through `RatingApi.goLabel` where
  a module can't depend on `rating`). The lobby keeps the `go` perf before its first game, so a
  declared rank shows on hooks and seeks. Labels come from the whole rating.
- Worked: lila's injected `RatingApi` trait carries the label to `ui` without a new module
  dependency; 6.7's single `playerRatingLabel` function in the lobby made the browser side one edit.
- Didn't work / dead ends: ADR 0021's `rank` field name collides with the leaderboard position in
  user perf JSON, so the field is `goRank`. An overloaded `GoRating.label` broke Scala's automatic
  function conversion (eta-expansion); an explicit lambda fixed it. The game `JsonView` class needs
  a GameRepo, so its test covers `Namer` and the label only.
- Lessons: a rank label must come from the same number on every page. Glicko ratings are
  fractional but games, lobby entries and challenges keep the whole rating, so labelling the
  fraction showed a player as 1d on their profile and 1k in their games for up to a point.
- Decisions: `goRank` as the field name; Go perf in user links; puzzle ratings stay numbers;
  labels from the whole rating; the one Go leaderboard waits for 3.17 (part 2) (Claude, under the
  owner's 2026-09-28 delegation; logs/decisions.md, ADR 0021 §3 amendment).
- Review (reviewer agent): blocking: oxfmt, labels disagreeing at rank edges with a test that
  could not fail, three missed pages (game list players, mini-profile, challenge page), and the
  lobby dropping a declared rank before the first game (showing "6k?"); all fixed, the rating
  fixtures' label rule now uses the whole rating. Non-blocking fixed: the ADR amendment, the
  provisional label's class, a comment on `renderRating`. Left for 5.6: activity and the
  profile's OG title; left to its owners: `Relation`'s JSON (best perf) and the analysis page's
  nvui view (Phase 7).
- Verified by Claude: `rating/test` 16/16 (GoRatingTest, with the regenerated fixtures),
  `game/testOnly lila.game.GoRankLabelTest`, `lobby/testOnly lila.lobby.GoHookTest` 6/6,
  `security/testOnly lila.security.GoRankChangeTest` 5/5, lila compile with no warnings,
  `node ui/test lobby`, verify.sh. · Needs owner verification: the labels on the real stack (a
  user link, a game list, the lobby, a challenge, the round page), and their hover titles.
- Follow-ups: part 2 (the one Go leaderboard, deviation ≤ 75) after 3.17; 5.6 the profile.

### 2026-10-03 · unit 5.4 (part 2) · Change the Go rank on the account page
- Did: a "Your Go rank" account page (`/account/go-rank`, menu entry after "Change username") with
  "I don't know" or 25k–9d, preselected from the stored `go` perf; saving rewrites the perf as at
  signup (`GoRankChange.perfOf`, now shared with `Signup`). It is open while the `go` perf has no
  games and the player has no rated game that got going (`Query.gotGoing`: started, not aborted,
  not abandoned before the first move); otherwise the page says the rank now moves only by playing
  and a POST just redirects. Two i18n keys. Desktop and phone screenshots, open and locked, with an
  axe check (`ui/playground/e2e/account-go-rank.spec.ts`, served without a lila server like the
  credits page).
- Worked: 5.4 part 1's form parsing and `UserPerfsRepo.setPerf`; `Query.rated(u)`.
- Didn't work / dead ends: pref's UI can't depend on rating, so the rank names come in from
  `app/views/ui.scala` (as AuthUi's do). The full site can't run in cloud sessions, so the
  screenshots are of a trimmed copy of the page's markup, not lila's own render.
- Lessons: lila starts a game at pairing (status Started) and aborts it before 2 plies; `NoStart`
  (37) is a third "never really played" status, used for no-abort games, and PerfsUpdater never
  rates any of them. A "has played a rated game" query must exclude all three.
- Decisions: "until the first rated game starts" means a rated game that got going (not aborted or
  abandoned before its first move); "I don't know" stays a choice and resets to lila's default; the
  page's axe check lets off lila's own button blue and orange headings, as a11y.spec.ts does, until
  9.7 (Claude, under the owner's 2026-09-28 delegation; logs/decisions.md).
- Review (reviewer agent): blocking: screenshots missing, an MIT licence line on a file partly moved
  from AGPL code, no UPSTREAM rows for this unit or part 1; all fixed (screenshots added, the MIT
  line dropped, both rows added). Non-blocking fixed: `NoStart` games locked the rank; the query
  now uses `Query.rated(u)` and a shared, tested status predicate. Left: the check and the write
  aren't atomic (a pairing landing in the same milliseconds keeps the new rank; documented); the
  form also takes "new" (25k), harmless. Reported to the coordinator: docs/UPSTREAM.md lacks rows
  for several earlier units that edited lila/.
- Verified by Claude: `game/testOnly lila.game.GotGoingTest` 3/3, `security/testOnly
  lila.security.GoRankChangeTest` 5/5, lila compile, the 4 page tests (screenshots looked at, also
  unmasked), verify.sh. · Needs owner verification: the page on the real stack: change the rank,
  see the flash and the new selection, then after a rated game (from 5.7) see the locked text.
  `hasRatedGame` hasn't run against a real Mongo.

### 2026-09-30 · unit 5.3 · Rated Go games move ratings with handicap
- Did: `PerfsUpdater` rates a finished rated Go game in the one `go` perf with 5.2's `GoRating`:
  each player against the opponent's handicap-shifted rating, Glicko-2 step 6 on, OGS's volatility
  ceiling (new `GoRatedGame` in `lila/modules/round`, `Perf.addOrResetCapped` in `rating`). No
  `RatingRegulator` factor for `go`; a Go game no longer recomputes the chess `standard` perf.
  Resignation and time already end Go games with a winner (3.13); the scoring phase follows in 4.8.
- Worked: three of goratings' own games from 5.2's `goRatingCases.json` (an even 19x19 resignation,
  the memo's 4-stone game, a 9x9 two-stone loss on time) come out of `PerfsUpdater.newPerfs` from a
  finished lila `Game` to 1e-6, ratings, deviations and volatilities.
- Didn't work / dead ends: my first even-game test expected a rank difference of 0; goratings counts
  6.5 komi as half a point over its fair 6 (a 24th of a rank for White), so the test now expects that.
- Lessons: lila's `addOrReset` and `toGlickoPlayer` cap volatility at chess's 0.1; Go needs its own
  cap at both ends or ADR 0013's 0.15 ceiling is silently lost.
- Decisions: a rated Go game ADR 0021 §4 keeps casual (13x13, custom position, other komi, too many
  stones) is logged and left unrated rather than rated wrongly; `FarmBoostDetection`
  unchanged (its standard-chess thresholds apply to Go: two related new accounts need 40+ plies or
  90+ s for the game to count, which 5.8's demo must respect) (Claude, under the owner's 2026-09-28
  delegation; logs/decisions.md).
- Review (reviewer agent): 3 blocking, all fixed: 13x13 games were rated (ADR 0021 §4 keeps server
  games 9x9 and 19x19); no test went through `PerfsUpdater` and the even-game test compared the code
  with itself (the pure rating step is now `PerfsUpdater.newPerfs`, tested against goratings' values;
  dropping the Go cap or the `standard` skip now fails a test); COPYING and UPSTREAM rows. Also done:
  a loss on time. Noted, not changed: `botFarming` compares chess SANs, empty for Go, so a rated Go
  game against a bot repeating a pairing's winner would go unrated (LiGo has no bots since 3.5); a
  "crazy Glicko" reset writes lila's default (1500, 500, 0.09), the same start ADR 0021 gives an
  account that never declared a rank.
- Verified by Claude: `sbt "round/testOnly lila.round.GoRatedGameTest"` 6/6 (and 1 failing with the
  `standard` skip removed); verify.sh.
  · Needs owner verification: none until rated games can be created (5.7); the 5.8 demo plays one.
- Follow-ups: 5.7 keeps un-rateable Go games casual at creation; retune `FarmBoostDetection` for Go
  if the demo or player tests trip it.

### 2026-09-30 · unit 5.4 (part 1) · Go rank at signup
- Did: the signup form asks "Your Go rank" (I don't know / I'm new to Go / 25k–9d, default "I don't
  know"); a declared rank sets the new account's `go` perf to `GoRating.startingGlicko` (middle of
  the rank, deviation 250) right after the user is created; "I don't know" leaves lila's default.
  Four i18n keys in `translation/source/site.xml` (key.scala regenerated with bin/i18n-file-gen.ts).
  `SecurityForm.SignupData` gains `goRank`, validated server-side; `Signup` gets `UserPerfsRepo`.
  The simple-signup prefill leaves it at "I don't know".
- Worked: 3.11's `PerfKey.go` and `UserPerfsRepo.setPerf` were all that was needed.
- Didn't work / dead ends: `web` (AuthUi) can't depend on `rating`, so the rank names are passed in
  from `app/views/ui.scala`. This container's `~/.sbt/repositories` predated 3.10, so strategygames
  didn't resolve until `dev/cloud-setup.sh` was re-run.
- Lessons: since 3.10, every lila compile needs PlayStrategy's Maven repo; re-run
  `dev/cloud-setup.sh` in an older cloud container before building lila.
- Decisions: split 5.4 (signup now, account page after 3.16); i18n keys rather than English literals
  (Claude, under the owner's 2026-09-28 delegation; logs/decisions.md).
- Review (reviewer agent): no blocking findings. Addressed: a failed perf write after the account
  exists is logged and keeps lila's default rating instead of failing the signup; the help text no
  longer promises a shown rank; `i18n.d.ts` regenerated; a test that the declared Glicko survives
  the perf BSON round trip. Not done: a form-binding test (the form needs its Env's dependencies)
  and routing through `UserApi.setPerf` (same write, one more hop).
- Verified by Claude: `sbt "rating/testOnly lila.rating.GoRatingTest; security/testOnly
  lila.security.SignupGoRankTest"` 15/15 and 4/4; `web/compile`; scalafmt; verify.sh (all gates
  pass). · Needs owner verification: the signup page on the real stack (the full site can't run
  in cloud sessions): the question shows, and signing up as 5k shows a 5k? rating.
- Follow-ups: part 2 after 3.16: change the rank on the account page until the first rated game
  starts; desktop and phone screenshots.

### 2026-09-29 · unit 5.2 · Rating maths in lila/modules/rating
- Did: added `GoRating` (lila/modules/rating/src/main/GoRating.scala): OGS's rank curve and its
  inverse, `Rank` (25k–9d) with labels clamped to 25k–9d and "?" while provisional, the rank table,
  the self-declared starting Glicko (middle of the rank, deviation 250, volatility 0.06), goratings'
  handicap rank difference and LiGo's variant (1 stone rated as handicap 0), effective ratings, a
  two-call `rateGame`, suggested stones, and a Go calculator (tau 0.5, step 6 on). Tests against
  `goRatingCases.json`, written by goratings' own Python (script beside it).
- Worked: every case matched goratings to 1e-6 on the first run (168 rank cases, the 90-row
  handicap grid, 5 Glicko-2 updates, 5 handicap games including the memo's 4-stone game). Changing
  tau to 0.75 or dropping the 25k clamp made 4 tests fail, so the tests do bite.
- Didn't work / dead ends: `Glicko.provisional` is scalachess's `RatingProvisional`, not a Boolean
  (`.yes`). The session-start `dev/ligo deps` had failed on strategygames' resolver, but
  `sbt rating/test` doesn't need it.
- Lessons: goratings' raw files and package are reachable from cloud sessions
  (raw.githubusercontent.com), so expected values can come from the original, not a second port.
- Decisions: the Go constants live in `GoRating`, not `Glicko.scala`, so chess games and puzzles keep
  lila's values until 3.17/5.3; the shared case table is generated by goratings (Claude, under the
  owner's 2026-09-28 delegation; logs/decisions.md).
- Verified by Claude: `sbt "rating/testOnly lila.rating.GoRatingTest"` 14/14 (11 before the review fixes); `./lila.sh scalafmtCheckAll`; verify.sh.
  · Needs owner verification: none (nothing calls the code yet).
- Review (reviewer agent): no blocking findings; goratings' cases regenerated byte-identical.
  Addressed: `GoRating.cap` (lila's floors with OGS's 0.15 volatility ceiling; lila's `GlickoExt.cap`
  would use 0.1) now applied by `rateGame`, which returns the `Try` for its caller to log; tests
  for deviation exactly 110, a draw and the caps; COPYING and UPSTREAM record the new MIT file;
  PLAN's `GoRank` name points at `GoRating`. Noted, not changed: the "never declared → even game"
  rule needs the account, so 5.7 applies it; "I don't know" keeps lila's default volatility 0.09
  (ADR 0021 §2) rather than ADR 0013's 0.06 for new players.
- Lesson: verify.sh's lila tests gate runs sbt `testQuick`, which prints "Total 0" when the tests'
  inputs already compiled; run `testOnly` for the proof and let CI run the clean build.
- CI: the `ui` job's `oxfmt --check` also formats JSON under lila/, so the generated table failed it
  once; it is now run through oxfmt (step in the generator). verify.sh's JSON gate only parses.
- Follow-ups: 5.3 calls `rateGame` from `PerfsUpdater` and logs its failures; the verify gate's
  testQuick behaviour is a tooling follow-up.

### 2026-09-29 · unit 5.1 · Phase 5 design (ADR 0021)
- Did: wrote ADR 0021: one `go` perf for every rated game; signup rank list 25k–9d starting at the
  middle of the rank with deviation 250, changeable until the first rated game starts; server-made
  labels clamped 25k–9d with "5k?" while provisional, and a server rank table for browser rank
  ranges; rated handicap (19×19 0–9, 9×9 0–4) with spec komi only, in direct challenges only until
  Phase 6's pools; suggested stones = round(rank gap / stone value); guests casual only.
- Worked: the memo's spike numbers give the examples directly (5k = rank 25.5 ≈ 1580, 1d = 30.5 ≈ 1960).
- Didn't work / dead ends: the first draft had four gaps the reviewer caught: it allowed 13×13
  rated games (R-SCOPE-1 leaves 13×13 out), said the browser never needs ranks (lila builds rating
  ranges in the browser), trusted lila to keep guests out of rated games (a guest can accept a rated
  open challenge), and left rated handicap for seeks and open challenges undecided.
- Lessons: goratings' 1-stone Chinese case adds a compensation point LiGo's rules don't give; rate
  LiGo's 1-stone game as handicap 0 with komi 0.5. lila's `FarmBoostDetection` can silently skip the
  rating update between new accounts in direct challenges; Go demos must play long games or retune it.
- Decisions: all of ADR 0021, Claude's call under the owner's 2026-09-28 delegation (logs/decisions.md).
- Verified by Claude: numbers recomputed in Python (midpoints, 5k vs 1d, goratings' values for 0–5
  stones); verify.sh; reviewer pass (4 blocking, 12 non-blocking, all addressed in the ADR).
  · Needs owner verification: whether the choices feel right for Go players.
- Follow-ups: 5.2 builds `GoRank` and the rank table to this ADR; 5.3 retunes FarmBoostDetection.

### 2026-09-29 · Phase 5 breakdown · Accounts and ratings split into units 5.1–5.8
- Did: split Phase 5 into 8 units (docs/PLAN.md §5, "Phase 5 units"): a design ADR (5.1), the
  rating maths in `lila/modules/rating` (5.2), then the lila halves: the rating update with
  handicap (5.3), signup rank (5.4), kyu/dan display (5.5), profile and rank graph (5.6), rated and
  guest game creation (5.7) and the demo (5.8), which need Phase 3's game, round, creation and UI.
- Worked: ADR 0013 and the ratings memo already fix the maths; the memo's spike numbers become 5.2's
  tests. The open points (signup ranks, display bounds, stone count and cap, guests) all land in 5.1.
- Didn't work / dead ends: none.
- Lessons: Glicko-2 step 6 is switched off in `round`'s `PerfsUpdater` (`skipDeviationIncrease =
  true`), not in the rating module, so it changes with the round unit (5.3), not with the maths (5.2).
- Decisions: the split itself, Claude's call under the owner's 2026-09-28 delegation
  (logs/decisions.md).
- Verified by Claude: verify.sh. · Needs owner verification: whether the split reads right.
- Follow-ups: 5.1 next, then 5.2.

### 2026-09-28 · 1.4 · Owner chose lila's Glicko-2 with OGS's settings
- Did: recorded the owner's answer (option A) as ADR 0013; marked the memo decided; updated STATUS and decisions.md.
- Worked: the decision card was answered without follow-up questions.
- Didn't work / dead ends: none.
- Lessons: none new.
- Decisions: A (owner) → ADR 0013; settles PLAN §10's 9×9 stone value (6 ranks).
- Verified by Claude: docs-only; /verify and CI on the PR. · Needs owner verification: none.
- Follow-ups: Phase 5 writes the glue (GoRank/handicap object, two calls per game in PerfsUpdater, four constants, one overall Go perf) with goratings' MIT notice in COPYING.md.

### 2026-09-27 · 1.4 · Build-vs-buy: ratings (scalachess Glicko-2 + goratings formulas)
- Did: read lila's rating module and PerfsUpdater, scalachess-rating 17.17.1, goratings @ 6cab309 and OGS's rank_utils.ts @ d94be54, PlayStrategy's lila rating module. Spiked scalachess-rating in a throwaway sbt 2.0.9 / Scala 3.8.4 project with a Scala port of goratings' rank curve and handicap maths, and ran the same cases through goratings' own Python. Wrote docs/build-vs-buy/ratings.md; asked the owner A (OGS settings) vs A2 (lila settings).
- Worked: 5/5 Glicko-2 per-game updates identical to 6 decimals (lila's floors/caps/start values still differ; listed in the memo) with tau 0.5 and step 6; 90/90 handicap grid rows identical; a 4-stone game identical to goratings' one-game-at-a-time pattern. ADR 0004's curve constants (525, 23.15) confirmed in goratings and OGS's frontend.
- Didn't work / dead ends: importing `analysis.util` needs filelock (not installed; loaded the two files directly instead of installing anything). raw.githubusercontent.com 404'd for OGS's frontend path; a sparse blobless clone worked.
- Lessons: see the 2026-09-27 lines in Lessons. The reviewer caught three memo issues before the PR: the parameter table left out lila's volatility, start values, ±700 cap and bot halving; the "?" threshold lives in scalachess, not lila; and goratings' 9×9 stone value (6 ranks) settles a PLAN §10 item deferred to Phase 5, so the owner question now says so.
- Decisions: A vs A2 asked in the unit thread, pending (logs/decisions.md). ADR follows the answer.
- Verified by Claude: the spike outputs quoted in the memo. · Needs owner verification: none technical; the choice itself.
- Follow-ups: Phase 5 writes the GoRank/handicap glue in lila/modules/rating and PerfsUpdater, with goratings' MIT notice in COPYING.md; auto-handicap stone count and cap stay a Phase 5 lobby decision (9×9 stones are worth 6 ranks each, so the cap matters there); one overall Go perf replaces lila's per-speed perfs in Phase 5.
