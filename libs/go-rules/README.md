# libs/go-rules: the server's Go rules

lila decides, on the server, whether a move is legal and what it captures. For chess it uses
scalachess; for Go it will use this library (Phase 3 wires it in). It wraps PlayStrategy's
[strategygames](https://github.com/Mind-Sports-Games/strategygames) Go package (ADR 0012) and adds
what LiGo's rules spec (`docs/rules/spec.md`) asks for on top.

## What lila gets

```scala
import ligo.gorules.*

val game0 = GoGame.start(Setup(BoardSize.Nineteen, Ruleset.Japanese, komi = Komi.standard(Ruleset.Japanese, 0)))
// Either[SetupError, GoGame]
game0.flatMap(_.play(Point.fromSgf("pd").get)) // Either[Refusal, GoGame]
```

- `GoGame.start(setup)`: board size, ruleset, komi, handicap (0–9) or a custom position.
- `play(point)`, `pass`, `resume`, `undo`: each returns the next game or why it was refused
  (`Refusal`: the fixture reasons occupied, suicide, superko, in-scoring, not-in-scoring and
  resume-limit, plus the adapter's own off-board and nothing-to-undo). The fixtures' `game-over`
  reason is lila's to give: the end of the game (acceptance, timeout, resignation) is decided there.
  Games are immutable values: nothing changes on a refusal.
- Read: `stones`, `toMove`, `captures`, `koPoint`, `phase` (play or scoring), `legalPoints`,
  `actions`.
- `Sgf.write(game, info)`: the game as an SGF record; `SgfInfo` optionally adds players, ranks,
  date, place, time settings (`TM`/`OT`) and the result (`RE`).
- `chainAt(point)`: the whole chain a stone belongs to. `closePlay`: ends play at lila's move cap
  and opens the scoring phase for good (resume is then refused as `play-closed`, ADR 0020 §3).
- `Scoring.open(game, phase, deadStones, request)`, then `toggle(point, seen)`, `counted(request, dead)`,
  `accept(color, seen)`, `agreed`, `canFinish`: the scoring phase's marks and acceptances (unit
  4.3, ADR 0020 §3). Toggles flip whole chains and clear both acceptances; toggles and accepts name
  the count the player saw (`CountVersion`: phase and request number), and are refused while a
  recount is pending; a count made for other marks is refused.
- `GameResult.fromTotals(black, white)`: the result from the scoring service's totals (it keeps the
  totals, so winner and margin always follow from them), with its
  SGF form (`B+3.5`, `0` for jigo, `W+R`, `B+T`, `W+F`, `Void`).
- `ByoyomiClock(ByoyomiConfig(mainSeconds, periods, periodSeconds), firstToMove)`: the byo-yomi
  clock (unit 4.2, ADR 0020 §7), strategygames' clock behind go-rules' types. `start`, `stop` (the
  scoring phase), `move(clientLag…)` after a stone or a pass, `outOfTime(color)`,
  `reading(color)` (time left in main time or the current period, periods left counting the one in
  progress), `giveTime`, and `state` / `ByoyomiClock.restore` for storage.

## What the adapter adds to strategygames

| Spec rule | strategygames on its own | The adapter |
|---|---|---|
| R-KO-2 superko history includes situations after passes (open point 1) | Records none | Records the situation after every pass |
| R-SP-1 no stones or passes in the scoring phase | Lets the player to move submit dead stones or keep passing | Two passes open the scoring phase; stones and passes are refused there |
| R-SP-6 resume restarts the pass count | Keeps counting; a 4th pass ends the game with no dead stones | Resets the count, so the 4-pass settlement can't happen |
| R-SP-9 no second resume without a stone in between | No notion of resuming | Refuses it (`resume-limit`) |
| R-KO-8 takeback removes situations | No takeback | `undo` returns the previous game value |
| R-HCP-2 1-stone handicap places no stone | Places one | Starts like an even game |

The rules of the scoring phase's marks and acceptances are here (`Scoring`); waiting for the
scoring service, the timeout and storage are lila's (unit 4.8); the score itself is counted by
goscorer in `services/scoring` (R-SCORE-3), never here.

## Tests

`dev/ligo test rules` runs:
- `ConformanceTest`: every `libs/conformance/fixtures` case that applies to the server, under each
  ruleset it names (both when it names none): 115 cases, 228 runs.
- `PropertyTest`: seeded random games on 9×9 and 19×19 checking that no chain is left without a
  liberty, stones are conserved and no stone placement repeats a situation (checked on real boards,
  not strategygames' hashes).
- `GoGameTest`: setup checks, komi, takeback limits. `SgfTest`, `SgfInfoTest`: SGF output.
- `ScoringTest`: chains, proposals, toggles, stale and pending counts, acceptance, closing play at
  the cap, results.
- `ByoyomiClockTest`: main time, keeping and using up periods, out of time, stopping for the
  scoring phase, lag compensation, handicap games (White's clock first) and storage.
- `ParityExportTest`: writes `target/parity/server.json` for the client's parity check (unit 1.8,
  `libs/board/test/parity.test.mjs`): every server fixture's game as SGF with its end position, and
  80 seeded random games on 9×9, 13×13 and 19×19 with the position after every action and the
  reason for every refused point at probed plies.
- `DifferentialTest`: the differential test's own plumbing (below), without KataGo.

## The differential test against KataGo (unit 1.9)

`dev/ligo differential` (native mode) and the `nightly-differential` workflow (every night, and on pull
requests that touch this folder) play random games with this adapter while KataGo follows the same
game over GTP, and compare after every action: the legal points (KataGo's strict legality, read from
the NAN mask of `kata-raw-nn`'s policy, because its `play` accepts ko retakes and suicide), the
stones, the player to move and the captures; and at the end the area score (strategygames' count vs
KataGo's `final_score`). The games are seeded: random size, ruleset and handicap, random stones that
don't fill a player's own one-point eye, the odd mid-game pass, takeback and resumption. Code:
`src/test/scala/ligo/gorules/differential/` (test scope: none of it ships).

- KataGo runs with situational superko, suicide illegal and plain area scoring (`KataGo.rules`); only
  its small test network is used, since its judgement plays no part.
- Scores are compared only on settled boards (both final passes forced: every empty point is a
  one-colour eye). KataGo counts stones inside the opponent's pass-alive area as dead, so an
  unsettled board would differ by design.
- A disagreement fails the run and writes `<seed>.txt` and `<seed>.sgf`; `--seed <seed> --games 1`
  replays that game. The final score LiGo shows comes from goscorer (Phase 4), not this count.
