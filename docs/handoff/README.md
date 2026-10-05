# LiGo: the handoff

LiGo is a proof of concept: lichess's server and website (lila and lila-ws) turned into a Go
server. It is not a business and isn't meant to compete with OGS. The point is to show what a
lichess-style experience (a fast, clear lobby, a clean game page, puzzles, analysis) feels like for
Go, and to leave behind parts others, OGS first, can reuse. This page was written on 2026-10-04.

## What it reuses

LiGo builds as little as it can (ADR 0002). Almost everything comes from existing open-source work:

| Part | Comes from | Licence |
|---|---|---|
| The site: accounts, lobby, game page, profiles, puzzles page, analysis page, websockets | lichess's lila and lila-ws, hard-forked in September 2026 (ADR 0001) | AGPL-3.0 |
| Server-side Go rules and the byo-yomi clock | PlayStrategy's strategygames (ADR 0012) | MIT |
| The board in the browser, the browser's rules, SGF, puzzle mode | OGS's goban and goban-engine (ADR 0014) | Apache-2.0 |
| Proposing dead stones at the end of a game | KataGo with goban's autoscore (ADR 0016) | MIT / Apache-2.0 |
| Counting the score | goscorer by lightvector, bundled in goban | MIT |
| Ratings and ranks | lila's Glicko-2 with OGS's settings, rank curve and handicap maths (ADR 0013) | MIT |
| Reading and writing SGF on the analysis board | @sabaki/sgf (ADR 0023) | MIT |

## What it built

LiGo's own code is mostly glue between those parts, plus:

- **`libs/board`**: a small wrapper that puts goban's board on lila's pages (`mountBoard`), with
  LiGo's rule settings, themes, touch confirm and puzzle mode.
- **`libs/go-rules`**: the server's adapter over strategygames, including the SGF reader.
- **`libs/conformance`**: 130 rules test cases plus SGF cases. The server's engine and the
  browser's engine both replay them, and a nightly test plays 1,000 random games against KataGo.
- **`services/scoring`**: a small Node service that asks KataGo which stones are dead and counts
  the score with goscorer.
- **`tools/puzzles`**: a tsumego generator. It solves positions exactly and has KataGo check them.
  It produced the 240 puzzles in `tools/puzzles/data/`.
- **The Go site itself**: chess removed from lila (Phase 3). Added: Go games with Japanese and Chinese rules, byo-yomi,
  Fischer and correspondence clocks, the scoring phase, ranks shown as kyu/dan with auto-handicap
  pools, a quick-pairing lobby, SGF import and export, the analysis board, the puzzle trainer,
  board themes, sounds, keyboard play, and an installable app.
- **Documents**: the rules spec (`docs/rules/spec.md`), 26 decision records (`docs/decisions/`),
  build-vs-buy memos (`docs/build-vs-buy/`), the lobby test kit (`docs/research/lobby-test/`) and
  logs of every unit (`logs/`). Their lessons are digested in [lessons.md](lessons.md).

## What is unfinished

By 2026-10-04 every unit in `docs/PLAN.md` §5 had merged. The last was 6.9, the lobby load test:
`dev/ligo loadtest` plays many pairs of 9×9 pool games at once over lila's own websockets with k6,
and a `loadtest` workflow runs it on demand (PR #138). One piece of 9.7 is left: the chess board
and piece pictures nothing uses any more are still in the tree, waiting on the owner's choice of how
to delete them.

The lobby player test (see [lobby-research.md](lobby-research.md)) can run now that 6.10, the
lobby demo, has merged. It needs real players, so it hadn't been run.

The demo video (unit 9.9) is recorded by `lila/tests/e2e-demo/handoff-video.spec.ts`: a 9×9 game
through the count, a puzzle, and an SGF import, at desktop and phone size. Every run of the `e2e`
workflow keeps the videos for 30 days as its `ligo-demo-video` artifact (Actions tab), and
`dev/ligo e2e video` records them on a running stack. The videos are not in git.

Beyond the plan, LiGo has never run in public. A public site would first need the legal steps in
PLAN §8 (UK Online Safety Act assessments, ICO registration, a privacy notice, moderation turned
back on). Languages other than English are not done either: the translation files still say
lichess in places.

## The other handoff pages

- [run-it.md](run-it.md): from a fresh clone to a running site.
- [lessons.md](lessons.md): what the project learned, by area.
- [for-ogs.md](for-ogs.md): the parts OGS could take, with their licences.
- [lobby-research.md](lobby-research.md): the lobby player test.

Licences in one line: lila-derived code is AGPL-3.0, LiGo's own code is MIT, and third-party
parts keep theirs. [`COPYING.md`](../../COPYING.md) has the details.
