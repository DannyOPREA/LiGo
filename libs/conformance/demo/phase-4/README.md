# The Phase 4 demo as a script (unit 4.12)

Two 19×19 Japanese games with byo-yomi (10 minutes, then 5 × 30 s), komi 6.5, played to the end
through the scoring phase. Black builds a wall down column J and White one down column K.

- **Game 1** (`demo0001`): both pass, the service proposes nothing dead, both accept. B+12.5.
- **Game 2** (`demo0002`): Black plays C17 (cc), White invades at D16 (dd), both pass. Black marks
  White's stone dead (a recount), accepts; White resumes instead. Black surrounds and captures the
  stone in play (White passes each turn), both pass again, both accept the second count. B+8.5.

| File | Written by | Checked by |
|---|---|---|
| `*-proposal.request.json`, `*-count2.request.json` | lila (`lila/modules/game/src/test/Phase4DemoTest.scala`): what it sends the scoring service | the scoring service (`services/scoring/test/demo-phase4.test.ts`) answers each one |
| `*.reply.json` | the scoring service's `handle()` without KataGo (`src: none`) | lila reads it as the answer, and the service must still give the same one |
| `game1.sgf`, `game2.sgf` | lila's SGF export (`SgfDump`, unit 4.11) at the end | lila (same text); `libs/board/test/sgf.test.mjs` reads it through goban-engine |
| `*.expect.json` | lila: the result, and the stones and prisoners at the end | `libs/board/test/sgf.test.mjs` must reach the same position |

To change the games: edit `Phase4DemoTest.scala`, delete the files it changes, then run lila's test
and the service's test in turn with `LIGO_DEMO_WRITE=1` until nothing is missing:

```sh
(cd lila && LIGO_DEMO_WRITE=1 ./lila.sh --server --batch "game/testOnly lila.game.Phase4DemoTest")
(cd services/scoring && LIGO_DEMO_WRITE=1 node --test test/demo-phase4.test.ts)
```

sbt doesn't see these files as the test's inputs, so after changing only them, run the test with
`testOnly` (as above), not a cached `test`.

These are LiGo's own files (MIT, ADR 0006). Not rules fixtures: nothing here defines a rule.
