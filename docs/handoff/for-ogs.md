# What OGS could take

LiGo was built so its useful parts could go to OGS whatever happens to LiGo itself (PLAN §8).
This page lists them with their licences. Offering anything to OGS is the owner's decision.
Claude never contacts OGS.

**Licences in short.**
- LiGo's own code and documents are MIT (ADR 0006, `COPYING.md` §2), so OGS can take them file by file.
- Code derived from lichess's lila stays AGPL-3.0. OGS's frontend is AGPL-3.0 too, so it is
  compatible, but anything taken from the lila-derived server must stay AGPL.
- Third-party parts keep their own licences (`COPYING.md` §3).

## Code and data

| Part | Where | Licence | Why it might help OGS |
|---|---|---|---|
| The board adapter: goban's SVG board behind a small `mountBoard` API (moves, confirm on touch, themes drawn in code, puzzle mode, a setup editor), plus LiGo's rule settings for goban-engine | `libs/board/src/` ([README](../../libs/board/README.md)) | MIT; it depends on goban and goban-engine (Apache-2.0, unmodified, from npm) | Shows goban used outside OGS's own site, with the workarounds that needed (listed in [lessons.md](lessons.md), "The board") |
| The rules test cases: 130 cases in JSON, each naming the rule it checks, plus SGF reading cases. Both LiGo engines replay them | `libs/conformance/` | `ligo.json`, the checker and the SGF cases: MIT. `goban.json`: Apache-2.0 (adapted from goban's tests). `strategygames.json`, `katago.json`: MIT (adapted). Notices in `libs/conformance/NOTICE.md` | An engine-neutral test suite goban-engine could replay as is |
| The rules spec: Japanese and Chinese rules as LiGo plays them, with rule IDs | `docs/rules/spec.md` | MIT | The written truth the fixtures test |
| The scoring service core: KataGo's ownership maps, goban-engine's autoscore and goscorer, with a benchmark over OGS's 31 autoscore games | `services/scoring/` | MIT; goban-engine Apache-2.0; OGS's test games Apache-2.0 (vendored unchanged) | A standalone way to propose dead stones and grade the proposals |
| The tsumego generator and 240 checked puzzles in goban's own puzzle format, each with its provenance | `tools/puzzles/`, `tools/puzzles/data/` | MIT; KaTrain's tsumego frame port MIT (`tools/puzzles/LICENSE-katrain.txt`); goban-engine Apache-2.0 | Puzzles free of copyright questions, already in goban's format |
| OGS's rank curve and handicap maths ported to Scala, with goratings' own values as tests | `lila/modules/rating/src/main/GoRating.scala` | MIT (LiGo's port; goratings is MIT, notice in `lila/modules/rating/NOTICE-goratings.md`) | A checked second implementation of goratings |
| The nightly differential test: random games checked against KataGo on legality, captures and area score | `dev/ligo differential`, `.github/workflows/nightly-differential.yml` | MIT | Could watch goban-engine the same way |

## Designs and research

All MIT, in `docs/`:

| What | Where |
|---|---|
| The lobby: quick-pairing pools with auto-handicap, open challenges sorted by fit with unsuitable ones greyed, one form for custom games and challenges | ADR 0005, ADR 0022 |
| The scoring phase: who proposes, how players adjust, accept or resume, time limits, the wire messages | ADR 0020 |
| Ranks and handicap shown as kyu/dan, signup with a self-declared rank | ADR 0013, ADR 0021 |
| Analysis board, SGF import and export, correspondence | ADR 0023 |
| Puzzles: what to generate, the trainer page | ADR 0024, ADR 0025 |
| Phones, sounds, themes, keyboard play, the installable app | ADR 0026 |
| The lobby player test (LiGo vs OGS) | [lobby-research.md](lobby-research.md) |
| Build-vs-buy memos comparing existing Go software | `docs/build-vs-buy/` |
| Logs of every unit, with lessons | `logs/`, digested in [lessons.md](lessons.md) |

## Worth reporting to goban

These came up while wrapping goban 8.3.226. Each has a workaround in LiGo, and each is a
candidate issue or pull request for goban. None has been checked against goban's current `main`.

- `getHandicapPointAdjustmentForWhite` under Chinese rules gives White 1 point for a 1-stone
  handicap (logs/scoring.md).
- The SGF loader ignores `SZ`, `KM` and `PL`, plays moves unchecked, and turns an out-of-turn
  move into an edit (logs/board-ui.md, logs/rules-engine.md).
- The superko check looks back only 30 moves (logs/rules-engine.md).
- `autoscore` changes the board it is given (logs/scoring.md).
- `onError` skips suicide refusals. `pass()` leaves stone placement on, and showing a preview turns it off (logs/board-ui.md).
- `getSelectedThemes` is called inside the constructor, before a subclass's fields exist
  (logs/board-ui.md).
- Theming and licensing:
  - The default theme loads a board picture from OGS's CDN, and those pictures have no stated licence.
  - The minified builds drop goscorer's MIT notice.
  - The npm releases lag `main` by months.

  (logs/board-ui.md)
