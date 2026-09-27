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
  (`Refusal`: occupied, suicide, superko, in-scoring, not-in-scoring, resume-limit, ...). Games are
  immutable values: nothing changes on a refusal.
- Read: `stones`, `toMove`, `captures`, `koPoint`, `phase` (play or scoring), `legalPoints`,
  `actions`.
- `Sgf.write(game)`: the game as an SGF record.

## What the adapter adds to strategygames

| Spec rule | strategygames on its own | The adapter |
|---|---|---|
| R-KO-2 superko history includes situations after passes (open point 1) | Records none | Records the situation after every pass |
| R-SP-1 no stones or passes in the scoring phase | Lets the player to move submit dead stones or keep passing | Two passes open the scoring phase; stones and passes are refused there |
| R-SP-6 resume restarts the pass count | Keeps counting; a 4th pass ends the game with no dead stones | Resets the count, so the 4-pass settlement can't happen |
| R-SP-9 no second resume without a stone in between | No notion of resuming | Refuses it (`resume-limit`) |
| R-KO-8 takeback removes situations | No takeback | `undo` returns the previous game value |
| R-HCP-2 1-stone handicap places no stone | Places one | Starts like an even game |

The dead-stone marking, acceptance and timeout of the scoring phase are lila's (Phase 4); the final
score is counted by goscorer in `services/scoring` (R-SCORE-3), not here.

## Tests

`dev/ligo test rules` runs:
- `ConformanceTest`: every `libs/conformance/fixtures` case that applies to the server, under each
  ruleset it names (both when it names none): 115 cases, 228 runs.
- `PropertyTest`: seeded random games on 9×9 and 19×19 checking that no chain is left without a
  liberty, stones are conserved and no stone placement repeats a situation (checked on real boards,
  not strategygames' hashes).
- `GoGameTest`: setup checks, komi, takeback limits. `SgfTest`: SGF output.
