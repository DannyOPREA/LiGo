# 0020. Scoring phase, the lila ⇄ scoring-service protocol, and byo-yomi in lila
- Status: Accepted
- Date: 2026-09-28
- Decided by: Claude, under the owner's 2026-09-28 delegation ("Don't ask for my approval for
  anything, just work until I tell you to stop"). Unit 4.1 (PLAN §5). The owner can revisit it with a
  superseding ADR.

## Context
Phase 4 adds the scoring phase and byo-yomi (PLAN §5, units 4.1–4.12). Earlier decisions fix the
parts but leave the joins open:

- ADR 0016: `services/scoring` (Node) is the only score authority: KataGo's two ownership maps,
  `goban-engine`'s `autoscore`, goscorer through `computeScore()`. It left to Phase 4 the lila ⇄
  service message (the plan's `moves`/`komi`/`handicap` against OGS's final board plus komi), where
  the prisoners come from, the no-KataGo fallback, and storing the proposal because KataGo is not
  deterministic.
- ADR 0019: Go games live in `game5` (`sz`, `ru`, `km`, `hc`, `ac`); until Phase 4 two passes end a
  casual game as "unknown finish" with no winner; a 1,000-ply cap does the same; "scored" is Phase
  4's to decide (§7); byo-yomi comes behind a small lila clock interface, stored under its own key
  (§5); scoring-phase messages come in Phase 4 (§6).
- The rules spec §7–8 (R-SP-1…9, R-SCORE-*, R-RES-*) says what the phase does, and leaves to Phase 4
  the timeout values and whether game clocks run during the phase (R-SP-7).
- `libs/go-rules` already has `Phase.Scoring`, `Action.Resume`, the resume limit (R-SP-9) and
  `Captures` (unit 1.7).
- lila already talks to an outside worker over Redis: `modules/fishnet/FishnetRedis.scala` (removed
  by unit 3.5, kept in git history) publishes work on one pub/sub channel, reads answers on
  another, and re-sends pending work when the worker announces `start`. lila-ws forwards simple
  round commands (`resign`, `abort`, …) to lila unchanged as `r/do <fullId> <json>`
  (`lila-ws/src/main/scala/ipc/ClientOut.scala`, `RoundPlayerForward`).

## Decision

### 1. Redis messages between lila and `services/scoring`
Two Redis pub/sub channels, as fishnet did: lila publishes on `scoring-in`, the service publishes
on `scoring-out`. Each message is one JSON object.

lila → service:

```json
{"t":"propose","ref":"abcd1234:1:1","size":19,"rules":"j","komi":6.5,"handicap":0,
 "board":"...19 rows of b/w/digits.../...","toMove":"b","prisoners":{"b":3,"w":5}}
{"t":"count", "ref":"abcd1234:1:2", ...same fields..., "dead":["pd","qc"]}
```

- `ref` is `<gameId>:<scoring phase number>:<request number>`. The phase number is 1 plus the
  number of resumes in the game's stored actions (`ac`), so it never repeats after a resume. lila
  only accepts a reply whose `ref` is the latest one it sent for that game, so a late answer from
  before a resume or an earlier toggle is dropped.
- The service gets the **final board**, not the moves: the position after the two passes, in ADR
  0019's compact board string, and the player to move. The service never replays moves, so it is
  never a second rules engine that could disagree with go-rules.
- `prisoners` are go-rules' `Captures` (`b` = White stones Black took during play). The service
  adds them, plus the stones marked dead, for Japanese counting (R-SCORE-J1); a board alone can't
  tell it about captures.
- `komi` is the game's komi. `handicap` is the number of handicap stones, **0 when `hc` is 0 or 1**
  (R-HCP-2 places no stone, and R-KOMI-3 gives no compensation for it). goban-engine's
  `computeScore` adds the Chinese compensation from it (R-KOMI-3, R-SCORE-4); goscorer counts
  territory and area. goban-engine 8.3.226 would give White 1 point for `handicap: 1`, so the
  service never passes 1, and unit 4.4 adds a scoring fixture for a 1-stone game. KataGo's
  ownership queries use the game's komi (it accepts any multiple of 0.5 from -400 to 400) and rules.

service → lila:

```json
{"t":"proposal","ref":"abcd1234:1:1","src":"katago","dead":["pd"],"seal":["ee"],
 "owner":"bbbww.d..", "score":{"b":{"territory":40,"stones":0,"prisoners":4,"total":44},
 "w":{"territory":30,"stones":0,"prisoners":5,"komi":6.5,"compensation":0,"total":41.5}}}
{"t":"count","ref":"abcd1234:1:2", ...same fields without src...}
{"t":"start"}
{"t":"error","ref":"...","message":"..."}
```

(In the example `pd` is a White stone marked dead, so Black's 3 prisoners from play become 4.)

- `dead` is always **whole chains**: the service widens autoscore's answer to every stone of each
  chain it touches before counting, so the count it returns is the count of the set it names.
  go-rules checks this on arrival (unit 4.3); a proposal that isn't whole chains is treated as an
  error, not silently widened by lila.
- `owner` is one character per point, row by row: `b` or `w` for a point that counts for that
  colour under the game's rules (territory, and under Chinese rules living stones too), `.` for a
  point that counts for nobody (dame, seki, living stones under Japanese rules). The UI draws
  territory from it.
- `seal` lists points autoscore says still need a move to settle. lila shows them to both players
  as a warning ("these points may need sealing; resume to play them") and gives them no other
  meaning.
- `total` includes komi and handicap compensation; go-rules turns the two totals into the result
  (§5). lila never counts.
- A `count` never asks KataGo: goscorer only, so recounts are fast and deterministic.
- `start` is sent when the service (re)starts. lila re-sends the latest unanswered request of a game
  on `start`, when its round is loaded, and every 30 s while one is outstanding (§4), so neither a
  service restart nor a lila restart loses a request.

### 2. What lila stores
The scoring phase lives on the game document in `game5`, in a subdocument `sc`, written by the round
when the phase opens and on each change:

| Key | Holds |
|---|---|
| `op` | when the phase opened |
| `q` | the latest request number (the third part of `ref`) |
| `cv` | the version of the count on show: the request number of the reply it came from |
| `pd` | the proposal's dead stones as received, 2-byte points as in the top-level `ac` |
| `src` | where the proposal came from: `k` KataGo, `n` none (fallback, §4) |
| `d` | the current dead stones (after toggles), same encoding |
| `sl` | points that still need sealing, same encoding |
| `ow` | the current `owner` string |
| `sb`, `sw` | the current count per colour as integers: territory, stones, prisoners; `sw` also komi × 2 and compensation; then the service's total × 2 (amended in unit 4.8: lila stores the total it was given rather than adding it up, since lila never counts) |
| `acc` | who accepted: 1 Black, 2 White, 3 both |
| `ex` | when the phase times out (§3.6), or, before a proposal, when lila gives up waiting (§4) |
| `pn` | a recount is pending (no count yet for the current `d`) |
| `tx` | the timeout passed while a recount was pending: the recount, when it comes, ends the game (§4; added in unit 4.8) |

The phase number is not stored: it comes from `ac` (§1). The proposal first shown (`pd`, `src`) is
never recomputed, only superseded by a resume. When play resumes, `sc` is removed. When the game
ends by acceptance or timeout, `sc` stays as the record of the result. While `sc` exists, the game's
`ck` (lila's "check at" time, which Titivate uses to find games needing attention) is set to `ex`,
so the phase's deadlines survive a lila restart (§3.6, §4).

### 3. The scoring phase on the server
It is a state machine inside the round, with the rules in `libs/go-rules` (unit 4.3) and the
waiting, timing and storage in lila (unit 4.8):

1. **Opening.** Two consecutive passes (R-END-1), or reaching the 1,000-ply cap (ADR 0019 §7),
   open the phase. lila writes `sc` (no proposal yet, `ex` = the wait limit of §4) and sends
   `propose`. Players see "Counting…". While waiting they can resume or resign; toggles and accept
   wait for the proposal. go-rules gets a way to open the phase at the cap without passes (unit
   4.3), since today only two passes open it.
2. **Proposal.** When the reply arrives, `d` = `pd` = its dead stones, `cv` = its request number,
   acceptances are cleared, and `ex` moves to the timeout.
3. **Toggle.** `{"p":"pd","v":"n:cv"}`: either player taps a stone; its whole chain flips (R-SP-3).
   lila refuses a toggle whose `v` is not the current phase and `cv`, or that arrives while a recount is
   pending, so two players tapping the same chain at once can't silently cancel each other: the
   second tap is refused and the player sees the new marks. Both acceptances reset, `pn` is set
   and lila sends `count`. Toggles go through lila's existing per-socket rate limit, and only one
   recount is ever outstanding per game.
4. **Accept.** `{"v":"n:cv"}` sets the player's bit. lila refuses it while a recount is pending or if
   `v` is not the current phase and `cv`, so a player can only accept the count they are looking at
   (R-SP-4). When both bits are set, the game ends (§5).
5. **Resume.** Either player, any time, within R-SP-9's limit (go-rules refuses otherwise). The
   dead marks go, `sc` is removed, play continues with the opponent of the second passer. After
   the 1,000-ply cap resume is refused, since no further move is allowed; unit 4.3 records this
   as a departure in the rules spec's §11 (it goes beyond R-SP-6/R-SP-9).
6. **Timeout (R-SP-7).** 3 minutes for live games and 1 day for correspondence, counted from when
   the proposal arrives and not restarted by toggles. On expiry the current marks are accepted as
   they stand: lila waits for a pending recount first (§4 bounds that wait). The round checks
   `ex` while it is loaded; after a lila restart, Titivate finds the game through `ck` and gives
   it to the round, which then fires the timeout (a new Titivate case, unit 4.8).
7. **Resign** ends the game as usual (R-END-2). **Leaving** (R-END-4): during the phase either
   player may claim victory when the other has gone, as lila offers today to the player whose
   opponent left on their turn; unit 4.8 widens lila's `mightClaimWin` to both players while `sc`
   exists. Correspondence games have no claim; the 1-day timeout ends them.

**Game clocks stop during the scoring phase.** The clock stops at the second pass and restarts on
resume for the player to move, with the time they had. lila's own out-of-time checks treat a
stopped clock with time used as out of time (`Game.outoftime`), so while `sc` exists `outoftime` is
false and a client `flag` or Titivate's flag check does nothing. Correspondence clocks can't be
stopped (their time runs from the last move), so on resume lila sets the game's last-move time to
the moment of the resume: the time spent in the phase is charged to nobody. Byo-yomi keeps its
periods. Nobody can lose on time while agreeing on dead stones; the phase's timeout bounds it.

### 4. When the service or KataGo can't answer
- **KataGo missing, crashed, or slower than 30 s** for a proposal: the service answers anyway with
  `src: "none"`, no stones dead, and the goscorer count of that board. Players mark dead stones by
  hand. goban's WASM estimator needs a browser (memo 1.3), so the Node fallback is "nothing
  dead"; unit 4.4 may swap in goban-engine's pure-JS estimator if it passes OGS's 31 games at
  least as well as "nothing dead" does (it needs no decision beyond that test).
- **No reply at all** (the service is down): lila re-sends as §1 says. The timeout doesn't start
  without a proposal. When `ex` passes with no proposal (10 minutes live, 1 day correspondence
  after `op`), lila ends the game as ADR 0019 §7 did: "unknown finish", no winner. Because `ex` is
  stored and `ck` points at it, this also happens after a lila restart.
- **A recount that never arrives** (the service dies after the proposal): when the timeout fires
  with `pn` still set, `ex` moves on by the same 10 minutes / 1 day; if the recount still hasn't
  come, the game ends the same way.
- A game ended this way is not a draw in Go's sense (R-END-5): it has no result. lila's round and
  game pages show a finished game with no winner as a draw today; unit 4.10 shows "No result"
  for it instead, and unit 4.3 adds this outcome to the rules spec (it extends R-SP-7's "never
  without a result" for the case where no count can be made).

### 5. Results and status
- The result comes from the accepted count: go-rules compares the two totals (R-RES-1): `B+3.5`,
  `W+0.5`, or jigo `0` (R-RES-3).
- **Status:** a game ended by counting gets scalachess's `Status.VariantEnd` with the winner, or no
  winner for jigo. lila already knows `VariantEnd` as a normal finish; the "scored" and "jigo"
  wording is unit 4.10's UI text (upstream falls through to "Game ended" for `VariantEnd` without
  a winner). No new status value is needed, so ADR 0019 decision 1's trigger for vendoring the
  neutral types does not fire.
- Resign, time and abandonment keep lila's statuses (`Resign`, `Outoftime`, `Timeout`), shown as
  `B+R`, `W+T`, `B+F` (R-RES-2).
- `sc` holds the count, komi and compensation; SGF export (unit 4.11) writes `RE` from them.

### 6. Round messages (lila ⇄ lila-ws ⇄ browser)
- Browser → lila-ws: `{"t":"score-toggle","d":{"p":"pd","v":"2:3"}}`, `{"t":"score-accept","d":{"v":"2:3"}}`,
  `{"t":"score-resume"}`. lila-ws adds these three names to the commands it forwards as
  `r/do <fullId> <json>` (as `resign` is today); it needs no Go knowledge. lila's `RoundSocket`
  gets the three matching cases.
- lila → clients: a versioned `scoring` event with the phase number, `v` (the count version:
  `<phase number>:<cv>`, since request numbers start again in each phase; amended in unit 4.3), `src`, `dead`, `seal`, `owner`, the count, `accepted: {"b":bool,"w":bool}`, `pending` (a
  recount is under way) and the time left; `{"t":"scoring","d":{"counting":true}}` while waiting
  for the proposal. A resume is the versioned `resume` event with the player to move and the
  clock. The game's end is lila's usual `endData` event, with the result string added.

### 7. Byo-yomi in lila
- lila's `Game` gets a small clock interface with two implementations: Fischer (scalachess's
  `chess.Clock`, unchanged, stored in `c`, `cw`, `cb`) and byo-yomi (go-rules' wrapper of
  strategygames' byo-yomi clock, unit 4.2). The round steps whichever the game has, with the same
  lag compensation as ADR 0019 §5.
- Byo-yomi is stored under a new key `cy`: the settings (main time, number of periods, period
  length), each player's time used and periods used up, whose clock it is and since when it has
  run; `cw`/`cb` keep the per-move clock history for both kinds.
- The clock in move events and the round's JSON gains `"periods":{"b":n,"w":n}` and `"byo"`
  (the period length), and (amended in unit 4.8, for the round UI of 4.10) `"inByo":{"b":bool,"w":bool}`,
  whether each side is in byo-yomi, since a reading alone can't tell main time from a period; a
  Fischer clock's JSON is unchanged.
- Correspondence keeps lila's days-per-move clock.

## Consequences
- The service is stateless: every request carries the whole board, so it can restart at any time,
  and a remote GPU worker could replace it later without changing lila.
- lila stores a few hundred bytes more per scored game (`sc`, mainly `ow`).
- Clocks stopping in the scoring phase differ from a strict reading of Japanese tournament rules,
  where clocks keep running during the confirmation of dead stones; online servers (OGS) stop them
  too.
- A game whose count can never be made (service down for the whole grace period) ends with no
  winner, as in Phase 3, rather than hanging.
- `Status.VariantEnd` shows up in upstream code that says "variant ending"; units 4.8 and 4.10 fix
  the texts they reach.

## Alternatives considered
- **Send the moves instead of the board** (PLAN §3.6's first sketch): the service would replay them
  in goban-engine, a second rules engine that could disagree with go-rules (memo 1.3 point 10).
- **Redis streams or lists instead of pub/sub:** they keep messages while the service is down, but
  lila has no stream consumer today, and fishnet's `start` re-send already covers restarts.
- **HTTP from lila to the service:** simpler to call, but ties the round to the service's
  availability and drops the queue boundary ADR 0016 relies on for a remote worker.
- **Clocks keep running in the scoring phase:** strict but harsh on phones and in byo-yomi, and
  the phase has its own timeout anyway.
- **A new "scored" status by vendoring scalachess's neutral types** (ADR 0019's option B): more code
  to own for a label `VariantEnd` already carries.
- **Restarting the timeout on every toggle:** lets two players toggle forever; the spec's timeout
  accepts the current proposal instead.
