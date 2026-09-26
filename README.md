# LiGo

A **non-commercial proof of concept**: a lichess-style server for the game of Go (Baduk/Weiqi),
built as a hard fork of [lichess](https://github.com/lichess-org/lila), the way
[lishogi](https://lishogi.org) adapted it for shogi.

The aim is to show how much better finding and playing a game of Go online can feel with a fast,
minimal, lichess-style interface. It is not a business and not a competitor to
[OGS](https://online-go.com). If it works well, the code, designs and lessons may be offered to the
OGS developers.

> **Status:** Phase 0 (project setup). The unmodified lichess code is imported and builds and runs;
> no Go yet. See [`docs/STATUS.md`](docs/STATUS.md).

## Documents

- [`docs/PLAN.md`](docs/PLAN.md): requirements, architecture, roadmap, working agreement
- [`docs/CLAUDE_SETUP.md`](docs/CLAUDE_SETUP.md): how Claude Code is set up to build this
- [`docs/STATUS.md`](docs/STATUS.md): where the project is right now
- [`docs/decisions/`](docs/decisions/): architecture decision records
- [`logs/`](logs/README.md): work logs, one file per area

## Built on

[lila](https://github.com/lichess-org/lila) and [lila-ws](https://github.com/lichess-org/lila-ws)
(lichess) · [strategygames](https://github.com/Mind-Sports-Games/strategygames) (PlayStrategy) ·
[goban](https://github.com/online-go/goban) (OGS) · [KataGo](https://github.com/lightvector/KataGo) ·
[goscorer](https://github.com/lightvector/goscorer). These are the planned components;
each is confirmed by a build-vs-buy review.

## Licence

lila-derived code is AGPL-3.0-or-later; LiGo's own code is MIT. See [`COPYING.md`](COPYING.md).
