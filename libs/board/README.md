# libs/board: the browser's Go rules (and, from Phase 2, the board)

The server decides which moves are legal (libs/go-rules, strategygames). The browser needs the same
answers without asking the server each time: to preview a move, to mark the ko, and later for the
analysis board and tsumego. It gets them from OGS's **goban-engine** (the engine-only build of
`goban`, pinned at 8.3.226, ADR 0014). This folder is where LiGo sets it up and proves it agrees
with the server.

## What lila's UI will get

```js
import { createEngine, play, tryMove, stateOf, readSgf } from "./src/engine.mjs";

const e = createEngine({ size: 9, ruleset: "japanese", komi: 6.5 }); // handicap games also pass `stones`
play(e, "ee");      // null when played, else "occupied" | "suicide" | "superko"
tryMove(e, "ee");   // the same answer without playing
stateOf(e);         // { board: [".X.."...], toMove, captures: { black, white }, koPoint }
readSgf(sgfText);   // an engine at the end of an SGF record's main line
```

## What LiGo sets that goban's presets would get wrong

| Spec rule | goban-engine's own preset | `src/engine.mjs` |
|---|---|---|
| R-KO-1 situational superko in both rulesets | Japanese: superko off ("no result"); Chinese: positional | `allow_superko: false`, `superko_algorithm: "ssk"` |
| R-HCP-4 fixed handicap stones | Chinese switches to free placement; places its own stones | The server's stones as the starting position, White to move |
| R-KOMI komi | Its own defaults; cuts komi to 0.5 in handicap games | Always given explicitly |
| R-KO-4 the ko point | None | Worked out from the last move |
| SGF records: size, komi, player to move | Ignored by its SGF reader, which also never reports a broken record | Read from the record's root and passed in; broken records and moves out of turn refused |

Known gaps, left as they are (the server is the referee, spec §9): goban-engine's superko looks back
only 30 moves and never at the starting position. The fixtures mark the five cases that show it
(`knownGaps.client`); the harness runs them as expected failures and says when one starts passing.

## Tests (`dev/ligo test rules`)

- `test/conformance.test.mjs`: every `libs/conformance` fixture that applies to the client, under
  each ruleset it names (both when none): 95 cases, 189 runs, 10 of them known gaps (5 cases).
- `test/parity.test.mjs`: replays what the server wrote (`libs/go-rules`' `ParityExportTest`):
  - SGF round trip: each of the 227 server fixture games, as the SGF the server writes, read back
    here ends in the same position, with the same legal and illegal moves;
  - 80 seeded random games (9×9, 13×13, 19×19; some with handicap; passes and resumes included):
    after every one of 16,100 actions the same stones, captures, player to move and ko point, and
    at probed plies the same answer, with the same reason, for every empty point.
- `test/engine.test.mjs`: the settings above, SGF glue, refusal reasons, and goban's own handicap
  table against R-HCP-4.

`dev/ligo test board` runs the first and last without the server.
