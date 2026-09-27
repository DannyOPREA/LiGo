# libs/conformance: the Go rules test cases

LiGo has two rules engines that must agree: the server's (strategygames, behind `libs/go-rules`,
unit 1.7) and the browser's (goban-engine, behind `libs/board`, unit 1.8). This folder holds the
test cases both of them replay, plus the scoring cases the scoring service replays (PLAN §3.3).
The cases are data (JSON), not code, so each engine's test harness reads the same files.

The rules they test are in [`docs/rules/spec.md`](../../docs/rules/spec.md). Every case names the
rule IDs it checks (like `R-KO-2`).

- `fixtures/*.json`: the cases, one file per source (below). Only the `go-rules-expert` agent edits
  them (a hook blocks other agents' edits), and every change needs the owner's approval: a fixture
  is the spec in executable form.
- `check.mjs`: checks that every fixture file is well formed (no engine needed). Run by
  `fast-check.sh`, by `/verify`, and in CI (the `meta` workflow).
- `check.test.mjs`: tests for the checker itself.

Licences: the checker, its tests and `fixtures/ligo.json` are MIT (ADR 0006). Each imported
fixture file keeps its source's licence (`source.license` in the file: goban's Apache-2.0,
strategygames' and KataGo's MIT), with the notices in [NOTICE.md](NOTICE.md).

## Where the cases come from

Existing suites first, new cases second (PLAN §3.3). One file per source:

| File | Source | Licence of the file |
|---|---|---|
| `fixtures/strategygames.json` | strategygames' Go tests at the commit ADR 0012 pins | MIT |
| `fixtures/goban.json` | OGS goban's engine tests and autoscore files | Apache-2.0 |
| `fixtures/katago.json` | KataGo's rules tests | MIT |
| `fixtures/ligo.json` | Written for LiGo: spec §10 bug classes no suite covered | MIT |

## The format

A fixture file is one JSON object; `idPrefix` is what every case id in the file starts with:

```json
{
  "format": 1,
  "idPrefix": "goban-",
  "source": { "name": "goban", "url": "https://github.com/online-go/goban", "commit": "e61c56e", "license": "Apache-2.0" },
  "cases": [ ... ]
}
```

Each case (all fields except those marked optional are required):

| Field | Meaning |
|---|---|
| `id` | Unique across all files, lowercase with dashes, starts with the file's `idPrefix` (`sg-`, `goban-`, `katago-`, `ligo-`). Never reused. |
| `title` | One plain-English line saying what happens. |
| `rules` | Spec rule IDs the case checks, e.g. `["R-KO-4", "R-MOVE-5"]`. |
| `from` | Where in the source it came from (`path:line`), or `"new"` for LiGo's own cases. |
| `appliesTo` | Which engines must pass it: any of `"server"`, `"client"`, `"scoring"`. |
| `size` | Board size: 9, 13 or 19 (the sizes both engines support). |
| `ruleset` | Optional. `"japanese"` or `"chinese"`. Omitted: the case must pass under **both**. Required when `score` is present. |
| `handicap` | Optional, default 0. 2–9 places the fixed stones of R-HCP-4 and gives White the first move; 1 places no stone and Black moves first (R-HCP-2). |
| `komi` | Optional. Only scoring reads it; required when `score` is present. |
| `setup` | Optional starting position: `{ "board": [...], "toMove": "black" }`. It is the game's starting situation (R-KO-2), not moves played. Omitted: the empty board (or the handicap stones) with the usual player to move. |
| `moves` | The moves played from the start, alternating colours from the player to move. Every one of them must be accepted. Tokens below. |
| `expect` | What must be true after the moves (below). |
| `score` | Optional, for `"scoring"`: the agreed dead stones and the totals (below). |
| `openPoints` | Optional. Numbers of the spec §12 open points the expectation depends on, e.g. `[1]`. If the owner picks the alternative, these are the cases to change. |
| `knownGaps` | Optional. `{ "client": "why" }`: an engine that is known to get this case wrong and that LiGo will not fix in that engine. Its harness runs the case as an expected failure and must report when it starts passing, so the entry can go. The server is the referee (spec §9), so it never has a known gap. |
| `notes` | Optional. Anything a reader needs, e.g. how an imported case was adapted. |

**Points** are SGF coordinates (R-BOARD-4): two lowercase letters, column then row, from the
top-left, `a` onwards (the letter `i` is used). `aa` is the top-left corner; on 9×9 `ee` is the centre.

**Boards** are drawn as one string per row, top row first (SGF row `a`): `.` empty, `X` black,
`O` white. On 9×9, `"X........"` is a black stone at `aa`.

**Move tokens**:

| Token | Meaning |
|---|---|
| a point, e.g. `"dd"` | The player to move places a stone there. |
| `"pass"` | The player to move passes. Two in a row end play and start the scoring phase (R-END-1). |
| `"resume"` | During the scoring phase, play resumes (R-SP-6): the board is as after the two passes and the player to move is the opponent of the second passer. Server only. |
| `"undo"` | An accepted takeback of the last move (R-KO-8). Server only. |

**`expect`** (all fields optional; a harness checks every field that is present):

| Field | Meaning |
|---|---|
| `board` | The whole board after the moves. |
| `toMove` | `"black"` or `"white"`. |
| `captures` | Stones each player has captured during play: `{ "black": 1, "white": 0 }` (`black` = White stones Black took). |
| `koPoint` | The ko point as R-KO-4 defines it, or `null` for none. |
| `phase` | `"play"` or `"scoring"`. Checked by the server only: goban-engine has no scoring phase, so a client harness ignores this field. |
| `legal` | Moves the player to move may make now (tokens as above). |
| `illegal` | Moves the player to move may **not** make now, each with the reason: `{ "move": "ab", "reason": "superko" }`. Reasons: `occupied`, `suicide`, `superko` (simple ko is a case of superko, R-KO-4), `in-scoring` (a stone or a pass during the scoring phase, R-SP-1), `not-in-scoring` (resume during play), `resume-limit` (R-SP-9), `game-over`. The last four only the server can give, so they appear only in cases that don't apply to the client. Checking an `expect` move never changes the position: each is tried on its own. |

**`score`** (scoring cases): `{ "dead": ["aa", ...], "black": 10, "white": 12.5, "result": "W+2.5" }`.
`dead` lists the stones marked dead in the accepted proposal (a whole chain's stones). `black`
and `white` are the final totals under the case's ruleset, White's including komi and any
handicap compensation (R-SCORE-4). Prisoners taken during play are the case's
`expect.captures` (zero when it has none); `result` is in SGF form (R-RES-2), `"0"` for jigo.

## Engine harnesses (units 1.7, 1.8 and the scoring service)

A harness loads every `fixtures/*.json`, keeps the cases whose `appliesTo` names it, and for each:
sets up the board size, ruleset (both, when omitted), handicap and setup; plays `moves`, failing if
one is refused; then checks each `expect` field (a client harness skips `phase`). It reports cases by `id`. It must not skip a case
without a `knownGaps` entry, and must not change a case to make it pass: if an engine and a case
disagree, the `go-rules-expert` agent decides which one is wrong and asks the owner.

## Coverage

`fast-check.sh --coverage` prints how many cases check each spec rule ID and which IDs no case
checks. Most rules no fixture covers belong to lila rather than to a rules engine: resigning,
time-outs, forfeits and draws (R-END-2 to R-END-5), the scoring-phase flow of proposals,
toggles, acceptance and its timeout (R-SP-2 to R-SP-5, R-SP-7), and komi defaults (R-KOMI-1,
R-KOMI-4). Their tests come with the Phase 4 units that build them. Still open for a later
fixture change: R-KO-7 (dead marks create no situations), R-HCP-1, R-RES-1 and R-SCORE-J3.

Expectations that only LiGo's server enforces (`phase`, `in-scoring`, `not-in-scoring`,
`resume-limit`, `undo`) have no engine to check them against until unit 1.7's adapter exists.
